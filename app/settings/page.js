"use client";

import { useState, useEffect } from "react";

export const DEFAULT_BUSINESS_SETTINGS = {
  sizeThreshold: 70,
  largeBlindSurcharge: 50,
  motorBaseCharge: 100,
  standardMarkup: 40, // 40%
  markupType: 'percent',
  ignoreRows: 1,
  customTerms: [
    "Free Installation",
    "80% payment due before production",
    "Remaining due before installation",
    "Manufacturing/Installation takes 4-5 weeks"
  ],
  excelMap: {
    location: 1,
    width: 2,
    height: 3,
    mountType: 4,
    colorCode: 5,
    mechanism: 6,
    blindType: 7,
    notes: 8
  }
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_BUSINESS_SETTINGS);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("lunora_business_settings");
    if (stored) {
      setSettings(JSON.parse(stored));
    }
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setIsSaved(false);
  };

  const handleMapChange = (key, value) => {
    setSettings(prev => ({ 
      ...prev, 
      excelMap: { ...prev.excelMap, [key]: Number(value) } 
    }));
    setIsSaved(false);
  };

  const handleTermChange = (index, value) => {
    const newTerms = [...settings.customTerms];
    newTerms[index] = value;
    setSettings(prev => ({ ...prev, customTerms: newTerms }));
    setIsSaved(false);
  };

  const handleAddTerm = () => {
    setSettings(prev => ({ ...prev, customTerms: [...prev.customTerms, ""] }));
    setIsSaved(false);
  };

  const handleRemoveTerm = (index) => {
    const newTerms = settings.customTerms.filter((_, i) => i !== index);
    setSettings(prev => ({ ...prev, customTerms: newTerms }));
    setIsSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem("lunora_business_settings", JSON.stringify(settings));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <main className="container" style={{ paddingTop: '2rem' }}>
      <h1 style={{ color: 'var(--primary-gold)', marginBottom: '0.5rem' }}>Business Settings</h1>
      <p style={{ opacity: 0.7, marginBottom: '2rem' }}>Configure pricing logic and quote parameters.</p>

      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Pricing Logic</h2>
        
        <div className="form-row">
          <div className="form-group">
            <label>Size Threshold (inches)</label>
            <input 
              type="number" 
              value={settings.sizeThreshold} 
              onChange={e => handleChange('sizeThreshold', Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label>Large Blind Surcharge ($)</label>
            <input 
              type="number" 
              value={settings.largeBlindSurcharge} 
              onChange={e => handleChange('largeBlindSurcharge', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Motor Base Charge ($)</label>
            <input 
              type="number" 
              value={settings.motorBaseCharge} 
              onChange={e => handleChange('motorBaseCharge', Number(e.target.value))}
            />
          </div>
          <div className="form-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>Standard Markup</label>
              <input 
                type="number" 
                value={settings.standardMarkup} 
                onChange={e => handleChange('standardMarkup', Number(e.target.value))}
              />
            </div>
            <select 
              value={settings.markupType || 'percent'} 
              onChange={e => handleChange('markupType', e.target.value)}
              style={{ width: 'auto', padding: '0.75rem', backgroundColor: 'var(--input-bg)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '6px' }}
            >
              <option value="percent">%</option>
              <option value="flat">Flat ($)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Quote Footer Terms</h2>
        <p style={{ opacity: 0.7, marginBottom: '1rem', fontSize: '0.9rem' }}>These will appear as bullet points on the professional PDF.</p>
        
        {settings.customTerms.map((term, i) => (
          <div className="form-group" key={i} style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <input 
                type="text" 
                value={term} 
                onChange={e => handleTermChange(i, e.target.value)}
                style={{ fontSize: '1.1rem', padding: '1.2rem 1rem' }}
                placeholder={`Term ${i + 1}`}
              />
            </div>
            <button 
              onClick={() => handleRemoveTerm(i)}
              style={{ width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '50%', background: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', fontSize: '1.2rem' }}
              title="Remove Term"
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={handleAddTerm} style={{ background: 'transparent', border: '1px solid var(--primary-gold)', color: 'var(--primary-gold)' }}>
          + Add Term
        </button>
      </div>

      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Excel Column Mapping & Parsing</h2>
        <p style={{ opacity: 0.7, marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Configure how the app reads your manually uploaded Excel/CSV files.
        </p>

        <div className="form-group" style={{ marginBottom: '2rem', width: '50%' }}>
          <label>Rows to Ignore (Headers/Titles)</label>
          <input 
            type="number" 
            value={settings.ignoreRows ?? 1} 
            onChange={e => handleChange('ignoreRows', Number(e.target.value))}
          />
        </div>
        
        <p style={{ opacity: 0.7, marginBottom: '1rem', fontSize: '0.9rem' }}>
          Which column contains which data? (A=0, B=1, C=2, D=3, E=4, etc.)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          {Object.keys(settings.excelMap || DEFAULT_BUSINESS_SETTINGS.excelMap).map(key => (
            <div className="form-group" key={key}>
              <label>{key.charAt(0).toUpperCase() + key.slice(1)} (Column Index)</label>
              <input 
                type="number" 
                value={(settings.excelMap || DEFAULT_BUSINESS_SETTINGS.excelMap)[key]} 
                onChange={e => handleMapChange(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSave} style={{ width: '100%' }}>
        {isSaved ? "✓ Settings Saved" : "Save Settings"}
      </button>
    </main>
  );
}
