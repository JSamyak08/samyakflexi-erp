import React, { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Save, Printer, UploadCloud } from 'lucide-react';

const PrintableJobCard = React.forwardRef(({ data, imagePreview }, ref) => {
  return (
    <div ref={ref} className="print-container">
      {/* Header */}
      <div className="print-header">
        <div className="logo-container" style={{ textAlign: 'center', marginBottom: '10px' }}>
          <img src="/samyak-logo.png" alt="Samyak International Ltd Logo" style={{ maxWidth: '300px', maxHeight: '90px' }} />
        </div>
      </div>

      <div className="print-title-bar">
        CYLINDER JOB CARD
      </div>

      <div className="print-body">
        {/* Left Column Table */}
        <div className="print-table-wrapper">
          <table className="print-table">
            <tbody>
              <tr className="highlight-row">
                <td className="label-col">Job Name</td>
                <td className="val-col">{data.jobName}</td>
              </tr>
              <tr>
                <td className="label-col">Creation Date</td>
                <td className="val-col">{data.creationDate}</td>
              </tr>
              <tr>
                <td className="label-col">Party Name</td>
                <td className="val-col">{data.partyName}</td>
              </tr>
              <tr>
                <td className="label-col">Invoice To</td>
                <td className="val-col">{data.invoiceTo}</td>
              </tr>
              <tr>
                <td className="label-col">Variant</td>
                <td className="val-col">{data.variant}</td>
              </tr>
              <tr>
                <td className="label-col">Printing <span style={{fontSize: '10px', fontWeight: 'normal'}}>(Reverse/Surface)</span></td>
                <td className="val-col">{data.printing}</td>
              </tr>
              <tr>
                <td className="label-col">Individual Pouch Size <span style={{fontSize: '10px', fontWeight: 'normal'}}>(Including Sealing)</span></td>
                <td className="val-col">{data.pouchOpenWidth || ''}{data.pouchOpenWidth && data.pouchHeight ? ' X ' : ''}{data.pouchHeight || ''}</td>
              </tr>
              <tr>
                <td className="label-col">Number of Cylinders</td>
                <td className="val-col">{data.numberOfCylinders}</td>
              </tr>
              <tr>
                <td className="label-col">Job Structure</td>
                <td className="val-col">{data.jobStructure}</td>
              </tr>
              <tr>
                <td className="label-col">Total Width</td>
                <td className="val-col">{data.totalWidth}</td>
              </tr>
              <tr>
                <td className="label-col">Total Height</td>
                <td className="val-col">{data.totalHeight}</td>
              </tr>
              <tr>
                <td className="label-col">Shell Size</td>
                <td className="val-col">{data.shellSize}</td>
              </tr>
              <tr>
                <td className="label-col">PET Size <span style={{fontSize: '10px', fontWeight: 'normal'}}>(Including Reg. Mark)</span></td>
                <td className="val-col">{data.petSize}</td>
              </tr>
              <tr>
                <td className="label-col">SIL Logo/Press Line</td>
                <td className="val-col">{data.silLogo}</td>
              </tr>
              <tr>
                <td className="label-col">ARC Mark</td>
                <td className="val-col">{data.arcMark}</td>
              </tr>
              <tr>
                <td className="label-col">Slitting Mark</td>
                <td className="val-col">{data.slittingMark}</td>
              </tr>
              <tr>
                <td className="label-col">Tracker Line</td>
                <td className="val-col">{data.trackerLine}</td>
              </tr>
              <tr>
                <td className="label-col">Special Instructions</td>
                <td className="val-col">{data.specialInstructions}</td>
              </tr>
              <tr>
                <td className="label-col">Approved By</td>
                <td className="val-col">{data.approvedBy}</td>
              </tr>
              <tr>
                <td className="label-col">Engravure</td>
                <td className="val-col">{data.engravure}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right Column Artwork */}
        <div className="print-artwork-wrapper">
          {imagePreview ? (
            <img src={imagePreview} alt="Final Approved KLD" className="artwork-image" />
          ) : (
            <div className="artwork-placeholder">
              <h2>FINAL APPROVED KLD</h2>
              <p>(No Image Attached)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default function CylinderJobCardForm({ onSave }) {
  const componentRef = useRef();

  const [formData, setFormData] = useState({
    skuCode: '',
    jobName: '',
    creationDate: new Date().toLocaleDateString('en-GB'),
    partyName: '',
    invoiceTo: 'Samyak International Ltd',
    variant: '',
    printing: 'Reverse',
    pouchOpenWidth: '',
    pouchHeight: '',
    numberOfCylinders: '',
    jobStructure: '',
    totalWidth: '',
    totalHeight: '',
    shellSize: '',
    petSize: '',
    silLogo: "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
    arcMark: 'Yes',
    slittingMark: 'Yes',
    trackerLine: 'Yes',
    specialInstructions: '',
    approvedBy: '',
    engravure: '',
    cylinderCost: '₹0',
    utilisationLimit: '10000',
    costBorneBy: 'Client (100%)',
    costBorneType: 'client' // client, us, both
  });

  const [imagePreview, setImagePreview] = useState(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Job_Card_${formData.jobName || 'Draft'}`,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDimensionBlur = (e) => {
    const { name, value } = e.target;
    if (value && /^\d+(\.\d+)?$/.test(value.trim())) {
      setFormData(prev => ({ ...prev, [name]: `${value.trim()} mm` }));
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitToSystem = () => {
    if (!formData.skuCode || !formData.jobName) {
      alert("SKU Code and Job Name are required to add to the system.");
      return;
    }
    onSave({
      id: Date.now(),
      sku: formData.skuCode,
      jobName: formData.jobName,
      cylinderCost: formData.cylinderCost,
      engravuresName: formData.engravure,
      costBorneBy: formData.costBorneBy,
      costBorneType: formData.costBorneType,
      clientGroup: formData.partyName || "Unassigned",
      dispatchedQty: 0,
      utilisationLimit: parseFloat(formData.utilisationLimit) || 10000
    });
    alert("Cylinder Job processed and added to Database successfully.");
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="glass-card" style={{ maxWidth: '1000px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2>Create Cylinder Job Card</h2>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={handlePrint}>
              <Printer size={18} /> Print to PDF
            </button>
            <button className="btn-primary" onClick={submitToSystem}>
              <Save size={18} /> Add to System
            </button>
          </div>
        </div>

        <div className="form-grid">
          {/* Tracking DB specifics not on print card */}
          <div className="form-group">
            <label>SKU Code (For System Tracking)*</label>
            <input className="form-control" name="skuCode" value={formData.skuCode} onChange={handleChange} placeholder="e.g. SKU-XC-101" />
          </div>
          <div className="form-group">
            <label>Cylinder Cost</label>
            <input className="form-control" name="cylinderCost" value={formData.cylinderCost} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Utilisation Limit (KG)</label>
            <input className="form-control" name="utilisationLimit" type="number" value={formData.utilisationLimit} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Cost Borne Type</label>
            <select className="form-control" name="costBorneType" value={formData.costBorneType} onChange={handleChange}>
              <option value="client">Client</option>
              <option value="us">Us</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="form-group">
            <label>Cost Borne Description</label>
            <input className="form-control" name="costBorneBy" value={formData.costBorneBy} onChange={handleChange} />
          </div>

          <div style={{ gridColumn: '1 / -1', height: '1px', background: 'var(--glass-border)', margin: '16px 0' }}></div>

          {/* Core Job Card Fields */}
          <div className="form-group">
            <label>Job Name</label>
            <input className="form-control" name="jobName" value={formData.jobName} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Party Name / Client Group</label>
            <input className="form-control" name="partyName" value={formData.partyName} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Creation Date</label>
            <input className="form-control" name="creationDate" value={formData.creationDate} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Invoice To</label>
            <input className="form-control" name="invoiceTo" value={formData.invoiceTo} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Variant</label>
            <input className="form-control" name="variant" value={formData.variant} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Printing (Reverse/Surface)</label>
            <input className="form-control" name="printing" value={formData.printing} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Individual Pouch Size (Open Width)</label>
            <input className="form-control" name="pouchOpenWidth" value={formData.pouchOpenWidth} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 120" />
          </div>
          <div className="form-group">
            <label>Individual Pouch Size (Height)</label>
            <input className="form-control" name="pouchHeight" value={formData.pouchHeight} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 150" />
          </div>
          <div className="form-group">
            <label>Number of Cylinders</label>
            <input className="form-control" name="numberOfCylinders" value={formData.numberOfCylinders} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Job Structure</label>
            <input className="form-control" name="jobStructure" value={formData.jobStructure} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Total Width</label>
            <input className="form-control" name="totalWidth" value={formData.totalWidth} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 150" />
          </div>
          <div className="form-group">
            <label>Total Height</label>
            <input className="form-control" name="totalHeight" value={formData.totalHeight} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 200" />
          </div>
          <div className="form-group">
            <label>Shell Size</label>
            <input className="form-control" name="shellSize" value={formData.shellSize} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 150" />
          </div>
          <div className="form-group">
            <label>PET Size</label>
            <input className="form-control" name="petSize" value={formData.petSize} onChange={handleChange} onBlur={handleDimensionBlur} placeholder="e.g. 150" />
          </div>
          <div className="form-group">
            <label>SIL Logo/Press Line</label>
            <input className="form-control" name="silLogo" value={formData.silLogo} onChange={handleChange} />
          </div>
          <div className="form-group">
             <label>ARC Mark</label>
             <input className="form-control" name="arcMark" value={formData.arcMark} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Slitting Mark</label>
            <input className="form-control" name="slittingMark" value={formData.slittingMark} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Tracker Line</label>
            <input className="form-control" name="trackerLine" value={formData.trackerLine} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Approved By</label>
            <input className="form-control" name="approvedBy" value={formData.approvedBy} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Engravure</label>
            <input className="form-control" name="engravure" value={formData.engravure} onChange={handleChange} />
          </div>

          <div style={{ gridColumn: '1 / -1', marginTop: '16px' }} className="form-group">
            <label>Artwork Upload (KLD)</label>
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }} />
          </div>
        </div>
      </div>

      {/* Hidden layout specifically structured for printing */}
      <div style={{ display: 'none' }}>
        <PrintableJobCard ref={componentRef} data={formData} imagePreview={imagePreview} />
      </div>

    </div>
  );
}
