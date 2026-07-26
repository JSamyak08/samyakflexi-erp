import React, { useState } from 'react';
import { 
  FileText, 
  PenTool, 
  Upload, 
  Trash2, 
  Check, 
  Settings, 
  Hash, 
  Image as ImageIcon,
  CheckCircle2,
  RefreshCw,
  Plus,
  ListOrdered
} from 'lucide-react';
import { 
  getAuthorisedSignature, 
  saveAuthorisedSignature, 
  clearAuthorisedSignature, 
  getDocumentPrefixes, 
  saveDocumentPrefixes,
  DEFAULT_PREFIXES,
  getDocumentTerms,
  saveDocumentTerms,
  DEFAULT_DOCUMENT_TERMS
} from '../services/settingsService';

export default function DocumentSettings() {
  // Signature State
  const [signatureImage, setSignatureImage] = useState(() => getAuthorisedSignature());
  
  // Prefixes State
  const [prefixState, setPrefixState] = useState(() => getDocumentPrefixes());

  // Terms & Conditions State
  const [termsState, setTermsState] = useState(() => getDocumentTerms());

  const [savedSuccess, setSavedSuccess] = useState(false);

  // Handle Image File Upload (PNG/JPG)
  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.includes('image/')) {
      alert('Please upload a valid PNG or JPG image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image file size must be less than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64 = uploadEvent.target.result;
      setSignatureImage(base64);
      saveAuthorisedSignature(base64);
      triggerSaveNotification();
    };
    reader.readAsDataURL(file);
  };

  const handleClearSignature = () => {
    clearAuthorisedSignature();
    setSignatureImage(null);
    triggerSaveNotification();
  };

  const handlePrefixChange = (field, value) => {
    setPrefixState(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSavePrefixes = (e) => {
    e.preventDefault();
    saveDocumentPrefixes(prefixState);
    triggerSaveNotification();
  };

  const handleResetPrefixes = () => {
    setPrefixState({ ...DEFAULT_PREFIXES });
    saveDocumentPrefixes({ ...DEFAULT_PREFIXES });
    triggerSaveNotification();
  };

  // Terms and Conditions Handlers
  const handleTermChange = (category, index, value) => {
    const updated = [...termsState[category]];
    updated[index] = value;
    setTermsState(prev => ({ ...prev, [category]: updated }));
  };

  const handleAddTerm = (category) => {
    setTermsState(prev => ({
      ...prev,
      [category]: [...prev[category], 'New term condition bullet...']
    }));
  };

  const handleRemoveTerm = (category, index) => {
    setTermsState(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
  };

  const handleSaveTerms = (e) => {
    e.preventDefault();
    saveDocumentTerms(termsState);
    triggerSaveNotification();
  };

  const handleResetTerms = () => {
    setTermsState({ ...DEFAULT_DOCUMENT_TERMS });
    saveDocumentTerms({ ...DEFAULT_DOCUMENT_TERMS });
    triggerSaveNotification();
  };

  const triggerSaveNotification = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/20 border border-indigo-400/30 rounded-xl backdrop-blur-sm">
            <Settings className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Document & Letterhead Settings</h1>
            <p className="text-slate-300 text-sm mt-1">
              Configure Authorised Signatory graphic, Document Prefixes, Payment Terms & Terms and Conditions
            </p>
          </div>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-lg text-sm font-semibold animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Settings Saved Successfully!
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SECTION 1: AUTHORISED SIGNATURE UPLOAD */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <PenTool className="w-5 h-5 text-indigo-400" />
              Authorised Signature (PNG/JPG)
            </h2>
            <span className="text-xs text-slate-400">Appears on PO, OCN & GRN</span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Upload an image of your company's authorised signature or stamp (PNG or JPG). This signature will render automatically above <strong>"Authorised Signatory"</strong> on all PDF letterheads.
          </p>

          {/* Signature Preview Box */}
          <div className="bg-slate-950 border-2 border-dashed border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center min-h-[160px]">
            {signatureImage ? (
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white p-4 rounded-lg border border-slate-700 shadow-md">
                  <img 
                    src={signatureImage} 
                    alt="Authorised Signature Preview" 
                    className="max-h-20 object-contain"
                  />
                </div>
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Active Authorised Signature Image
                </span>
              </div>
            ) : (
              <div className="text-center text-slate-400 space-y-2">
                <ImageIcon className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-xs">No custom signature uploaded. (Using default signature line)</p>
              </div>
            )}
          </div>

          {/* Upload Controls */}
          <div className="flex items-center gap-3 pt-2">
            <label className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-all shadow-md">
              <Upload className="w-4 h-4" />
              {signatureImage ? 'Change Signature' : 'Upload Signature PNG/JPG'}
              <input 
                type="file" 
                accept="image/png, image/jpeg, image/jpg" 
                onChange={handleSignatureUpload}
                className="hidden"
              />
            </label>

            {signatureImage && (
              <button
                type="button"
                onClick={handleClearSignature}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-rose-600/20 hover:text-rose-300 text-slate-300 border border-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                Remove
              </button>
            )}
          </div>
        </div>

        {/* SECTION 2: DOCUMENT REFERENCE NUMBER & PREFIX SERIES */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Hash className="w-5 h-5 text-indigo-400" />
              Document Series & Prefixes
            </h2>
            <span className="text-xs text-slate-400">Auto-numbering & Series</span>
          </div>

          <form onSubmit={handleSavePrefixes} className="space-y-4">
            {/* Purchase Order (PO) Series */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">Purchase Order (PO) Series</span>
                <span className="text-xs text-indigo-400 font-mono">
                  Sample: {prefixState.poPrefix}{prefixState.poCounter}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">PO Prefix Series</label>
                  <input
                    type="text"
                    value={prefixState.poPrefix}
                    onChange={(e) => handlePrefixChange('poPrefix', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Start Counter</label>
                  <input
                    type="number"
                    value={prefixState.poCounter}
                    onChange={(e) => handlePrefixChange('poCounter', parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Order Confirmation Note (OCN) Series */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">Order Confirmation Note (OCN) Series</span>
                <span className="text-xs text-indigo-400 font-mono">
                  Sample: {prefixState.ocnPrefix}{prefixState.ocnCounter}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">OCN Prefix Series</label>
                  <input
                    type="text"
                    value={prefixState.ocnPrefix}
                    onChange={(e) => handlePrefixChange('ocnPrefix', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Start Counter</label>
                  <input
                    type="number"
                    value={prefixState.ocnCounter}
                    onChange={(e) => handlePrefixChange('ocnCounter', parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Goods Receipt Note (GRN) Series */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">Goods Receipt Note (GRN) Series</span>
                <span className="text-xs text-indigo-400 font-mono">
                  Sample: {prefixState.grnPrefix}{prefixState.grnCounter}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">GRN Prefix Series</label>
                  <input
                    type="text"
                    value={prefixState.grnPrefix}
                    onChange={(e) => handlePrefixChange('grnPrefix', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Start Counter</label>
                  <input
                    type="number"
                    value={prefixState.grnCounter}
                    onChange={(e) => handlePrefixChange('grnCounter', parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md"
              >
                Save Series Configuration
              </button>
              <button
                type="button"
                onClick={handleResetPrefixes}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                title="Reset to default prefixes"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* SECTION 3: EDITABLE TERMS & CONDITIONS AND PAYMENT TERMS */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
        <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <ListOrdered className="w-5 h-5 text-indigo-400" />
            Default Payment Terms & Document Terms and Conditions
          </h2>
          <span className="text-xs text-slate-400">Default Bullet Terms for PO, OCN & GRN</span>
        </div>

        <form onSubmit={handleSaveTerms} className="space-y-6">
          {/* Payment Terms Input */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 max-w-md">
            <label className="block text-xs font-bold text-slate-200 uppercase tracking-wide mb-1">
              Default Payment Terms (e.g. 60 Days, 30 Days Net, 100% Advance)
            </label>
            <input
              type="text"
              value={termsState.paymentTerms}
              onChange={(e) => setTermsState(prev => ({ ...prev, paymentTerms: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* PO Terms */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">PO Terms & Conditions</h3>
                <button
                  type="button"
                  onClick={() => handleAddTerm('poTerms')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <div className="space-y-2">
                {termsState.poTerms.map((term, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-xs text-slate-500 mt-2 font-mono">{index + 1}.</span>
                    <textarea
                      rows={2}
                      value={term}
                      onChange={(e) => handleTermChange('poTerms', index, e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTerm('poTerms', index)}
                      className="text-slate-500 hover:text-rose-400 mt-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* OCN Terms */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">OCN Store Instructions</h3>
                <button
                  type="button"
                  onClick={() => handleAddTerm('ocnTerms')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <div className="space-y-2">
                {termsState.ocnTerms.map((term, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-xs text-slate-500 mt-2 font-mono">{index + 1}.</span>
                    <textarea
                      rows={2}
                      value={term}
                      onChange={(e) => handleTermChange('ocnTerms', index, e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTerm('ocnTerms', index)}
                      className="text-slate-500 hover:text-rose-400 mt-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* GRN Terms */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">GRN QC Observations</h3>
                <button
                  type="button"
                  onClick={() => handleAddTerm('grnTerms')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <div className="space-y-2">
                {termsState.grnTerms.map((term, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-xs text-slate-500 mt-2 font-mono">{index + 1}.</span>
                    <textarea
                      rows={2}
                      value={term}
                      onChange={(e) => handleTermChange('grnTerms', index, e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTerm('grnTerms', index)}
                      className="text-slate-500 hover:text-rose-400 mt-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md"
            >
              Save Payment Terms & Terms and Conditions
            </button>
            <button
              type="button"
              onClick={handleResetTerms}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            >
              Reset Terms Defaults
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
