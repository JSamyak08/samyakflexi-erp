#!/usr/bin/env node
/**
 * Dry-run plan for scrap-store rows and the high scrap registry.
 *
 * This script does not connect to a database and does not write.
 * Do not point it at production. Apply the planned writes only after review,
 * and only in an environment where migration
 * supabase/migrations/20261026140000_job_wastage_scrap_registry.sql
 * has been applied.
 *
 * Usage:
 *   node scripts/backfill-job-wastage.mjs snapshot.json
 *
 * snapshot.json shape:
 *   {
 *     "orders": [{ "id": "ORD-1", "jobName": "...", "orderQtyKg": 1000 }],
 *     "productionRecords": [{ "orderId": "ORD-1", "printingWastageKg": 60 }]
 *   }
 *
 * orderQtyKg is kilograms, the same unit as orders.order_qty_kg.
 * A SQL export may use order_qty_kg and the production_records wastage columns
 * plus process_logs. A job is flagged only when total stage wastage is
 * at least 5% of that order quantity. Jobs under 5% are listed as registry
 * deletes, not inserts.
 *
 * Suggested read-only export (do not run the INSERTs this script prints):
 *
 *   select o.id, o.job_name, o.order_qty_kg
 *   from public.orders o;
 *
 *   select pr.id, pr.order_id, pr.job_name, pr.client_name, pr.date_filled,
 *          pr.printing_plain_setting_wastage_kg, pr.printing_wastage_kg,
 *          pr.lamination_plain_substrate_wastage_kg,
 *          pr.lamination_plain_substrate_wastage_l2_kg,
 *          pr.laminate_wastage_kg, pr.printed_wastage_kg, pr.trim_wastage_kg,
 *          pr.pouching_scrap_kg, pr.process_logs
 *   from public.production_records pr;
 */
import fs from 'node:fs';
import { planBackfill } from '../src/utils/jobWastage.js';

const file = process.argv[2];
if (!file) {
  console.error('Pass a snapshot JSON file. This script does not connect to a database.');
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
const plan = planBackfill(snapshot);
const report = {
  orderQtyUnit: 'kg',
  thresholdPct: 5,
  scrapUpsertCount: plan.scrapUpserts.length,
  scrapDeleteCount: plan.scrapDeleteIds.length,
  flaggedJobCount: plan.flaggedJobs.length,
  registryDeleteCount: plan.registryDeletes.length,
  flaggedJobs: plan.flaggedJobs.map((job) => ({
    id: job.id,
    orderId: job.orderId,
    jobName: job.jobName,
    orderQtyKg: job.orderQtyKg,
    totalWastageKg: job.totalWastageKg,
    wastagePct: job.wastagePct,
    stages: job.stages
  })),
  registryDeletes: plan.registryDeletes,
  scrapUpserts: plan.scrapUpserts.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    stage: row.stage,
    type: row.type,
    scrapQtyKg: row.scrapQtyKg
  })),
  scrapDeleteIds: plan.scrapDeleteIds
};

console.log(JSON.stringify(report, null, 2));
