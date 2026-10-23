-- Seed the statutory company profile once. An existing row is left unchanged
-- so a later edit in Document Settings is not overwritten on deploy.
INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
VALUES (
  'company_profile',
  '{"name":"SAMYAK INTERNATIONAL LTD.","bseSymbol":"SAMYAKINT","cin":"L67120MH1994PLC225907","gstin":"23AABCM3526F1ZY","address":"11-B, Kheda Industrial Area, Pithampur Sector - III, Dist. Dhar, Dhar (Madhya Pradesh- 23), India - 454775","contactPerson":"Samyak Jain","phones":"8889133133","email":"info@samyakinternational.in","placeOfSupply":"Dhar, Madhya Pradesh (23)","logoUrl":"/samyak-logo.svg"}',
  now()
)
ON CONFLICT (setting_key) DO NOTHING;
