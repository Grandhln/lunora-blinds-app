"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { useReactToPrint } from "react-to-print";
import { DEFAULT_BUSINESS_SETTINGS } from "../settings/page";

export default function QuotePage() {
  const [settings, setSettings] = useState(DEFAULT_BUSINESS_SETTINGS);
  
  // Customer selection
  const [existingCustomers, setExistingCustomers] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [blindsList, setBlindsList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pricing State (maps blind id to an object { factoryCost, manualUpcharge })
  const [pricingData, setPricingData] = useState({});

  // Global Extras
  const [extras, setExtras] = useState([{ name: "", price: 0 }]);

  // Uploaded Excel Data
  const [excelData, setExcelData] = useState([]);

  const printRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Quote_${customerName}`,
  });

  useEffect(() => {
    // Load Settings
    const storedSettings = localStorage.getItem("lunora_business_settings");
    if (storedSettings) setSettings(JSON.parse(storedSettings));

    // Load Customers
    fetch('/api/sheets')
      .then(res => res.json())
      .then(data => {
        if (data.customers) setExistingCustomers(data.customers);
      })
      .catch(console.error);
  }, []);

  // Fetch Blinds when customer selected
  useEffect(() => {
    if (customerName && existingCustomers.includes(customerName)) {
      setIsLoading(true);
      fetch(`/api/sheets?customer=${encodeURIComponent(customerName)}`)
        .then(res => res.json())
        .then(data => {
          if (data.blinds) {
            setBlindsList(data.blinds);
            // Initialize pricing data for each blind if not exists
            const newPricing = {};
            data.blinds.forEach(b => {
              newPricing[b.id] = { factoryCost: 0, manualUpcharge: 0 };
            });
            setPricingData(newPricing);
          }
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [customerName, existingCustomers]);

  const handleMeasurementsUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      const map = settings.excelMap || DEFAULT_BUSINESS_SETTINGS.excelMap;
      const parsedBlinds = [];
      const newPricing = {};
      
      const startIndex = settings.ignoreRows !== undefined ? settings.ignoreRows : 1;
      for (let i = startIndex; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        
        const blindId = Date.now() + i;
        parsedBlinds.push({
          id: blindId,
          location: row[map.location] || '',
          width: row[map.width] || '',
          height: row[map.height] || '',
          mountType: row[map.mountType] || 'Inside',
          colorCode: row[map.colorCode] || '',
          mechanism: row[map.mechanism] || 'Manual',
          blindType: row[map.blindType] || '',
          notes: row[map.notes] || ''
        });
        newPricing[blindId] = { factoryCost: 0, manualUpcharge: 0 };
      }
      
      setBlindsList(parsedBlinds);
      setPricingData(newPricing);
      
      // Auto-set customer name to the file name
      setCustomerName(file.name.replace(/\.[^/.]+$/, "")); 
    };
    reader.readAsBinaryString(file);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      setExcelData(data.filter(row => row.length > 0)); // remove empty rows
    };
    reader.readAsBinaryString(file);
  };

  const handlePriceUpdate = (id, field, value) => {
    setPricingData(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: Number(value) }
    }));
  };

  const calculateBlindPrice = (blind) => {
    const pricing = pricingData[blind.id] || { factoryCost: 0, manualUpcharge: 0 };
    let base = settings.markupType === 'flat' 
      ? pricing.factoryCost + settings.standardMarkup 
      : pricing.factoryCost * (1 + (settings.standardMarkup / 100));
    base += pricing.manualUpcharge;

    // Surcharge
    const width = parseFloat(blind.width) || 0;
    if (width > settings.sizeThreshold) {
      base += settings.largeBlindSurcharge;
    }

    // Motor
    if (blind.mechanism === "Motorized") {
      base += settings.motorBaseCharge;
    }

    return base;
  };

  const getSubtotal = () => {
    return blindsList.reduce((acc, blind) => acc + calculateBlindPrice(blind), 0);
  };

  const getExtrasTotal = () => {
    return extras.reduce((acc, ex) => acc + (Number(ex.price) || 0), 0);
  };

  const getTotal = () => getSubtotal() + getExtrasTotal();

  return (
    <main className="container" style={{ paddingTop: '2rem' }}>
      <div className="no-print">
        <h1 style={{ color: 'var(--primary-gold)', marginBottom: '0.5rem' }}>Quote Generator</h1>
        <p style={{ opacity: 0.7, marginBottom: '2rem' }}>Select a customer, input factory costs, and generate a PDF.</p>

        {/* CUSTOMER SELECTION */}
        <div className="glass-panel" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>1. Load Customer Measurements</h2>
          
          <div className="quote-options">
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Option A: Select from Master Sheet</label>
              <select 
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">-- Select a Customer --</option>
                {existingCustomers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {isLoading && <p style={{color: 'var(--primary-gold)', fontSize: '0.85rem', marginTop: '0.5rem'}}>Loading blinds...</p>}
            </div>

            <div className="quote-option-divider">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Option B: Upload Measurements File (.xlsx/.csv)</label>
              <input type="file" accept=".xlsx, .csv" onChange={handleMeasurementsUpload} />
              <p style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '0.5rem' }}>
                Instantly parses your offline measurements using the Column Map from settings.
              </p>
            </div>
          </div>
        </div>

        {blindsList.length > 0 && (
          <>
            {/* EXCEL UPLOAD */}
            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem' }}>2. Upload Factory Quote (Optional)</h2>
              <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '1rem' }}>
                Upload an Excel (.xlsx) or CSV file from the factory to view costs on screen. You can then copy these costs to the blinds below.
              </p>
              <input type="file" accept=".xlsx, .csv" onChange={handleFileUpload} />
              
              {excelData.length > 0 && (
                <div style={{ marginTop: '1rem', maxHeight: '200px', overflowY: 'auto', fontSize: '0.85rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {excelData.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ padding: '4px' }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* PRICING TABLE */}
            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem' }}>3. Input Costs & Calculate</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--primary-gold)', color: 'var(--primary-gold)' }}>
                      <th style={{ padding: '0.5rem' }}>Location</th>
                      <th style={{ padding: '0.5rem' }}>Dims (W x H)</th>
                      <th style={{ padding: '0.5rem' }}>Type</th>
                      <th style={{ padding: '0.5rem' }}>Factory Cost ($)</th>
                      <th style={{ padding: '0.5rem' }}>Upcharge ($)</th>
                      <th style={{ padding: '0.5rem' }}>Final Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blindsList.map(blind => (
                      <tr key={blind.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <td style={{ padding: '0.5rem', textTransform: 'capitalize' }}>{blind.location}</td>
                        <td style={{ padding: '0.5rem' }}>{blind.width}" x {blind.height}"</td>
                        <td style={{ padding: '0.5rem', textTransform: 'capitalize' }}>{blind.blindType} ({blind.mechanism})</td>
                        <td style={{ padding: '0.5rem' }}>
                          <input 
                            type="number" 
                            style={{ width: '80px', padding: '0.2rem' }}
                            value={pricingData[blind.id]?.factoryCost || ''}
                            onChange={(e) => handlePriceUpdate(blind.id, 'factoryCost', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input 
                            type="number" 
                            style={{ width: '80px', padding: '0.2rem' }}
                            value={pricingData[blind.id]?.manualUpcharge || ''}
                            onChange={(e) => handlePriceUpdate(blind.id, 'manualUpcharge', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>
                          ${calculateBlindPrice(blind).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* EXTRAS */}
            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem' }}>4. Global Extras</h2>
              {extras.map((ex, i) => (
                <div key={i} className="extras-row" style={{ marginBottom: '1rem' }}>
                  <input 
                    type="text" 
                    placeholder="e.g. Solar Panel, Smart Hub" 
                    value={ex.name}
                    onChange={(e) => {
                      const newExt = [...extras];
                      newExt[i].name = e.target.value;
                      setExtras(newExt);
                    }}
                    style={{ flex: 2, fontSize: '1.1rem', padding: '1.2rem 1rem' }}
                  />
                  <input 
                    type="number" 
                    placeholder="Price ($)" 
                    value={ex.price || ''}
                    onChange={(e) => {
                      const newExt = [...extras];
                      newExt[i].price = Number(e.target.value);
                      setExtras(newExt);
                    }}
                    style={{ flex: 1, fontSize: '1.1rem', padding: '1.2rem 1rem' }}
                  />
                  <button 
                    onClick={() => setExtras(extras.filter((_, idx) => idx !== i))} 
                    style={{ width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '50%', background: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', fontSize: '1.2rem' }}
                    title="Remove Extra"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button onClick={() => setExtras([...extras, { name: "", price: 0 }])} style={{ background: 'transparent', border: '1px solid var(--primary-gold)', color: 'var(--primary-gold)' }}>+ Add Extra</button>
            </div>

            <button onClick={handlePrint} style={{ width: '100%', fontSize: '1.1rem', padding: '1rem', marginBottom: '2rem' }}>
              🖨️ Generate Professional PDF
            </button>
          </>
        )}
      </div>

      {/* --- PRINTABLE QUOTE VIEW --- */}
      {blindsList.length > 0 && (
        <div ref={printRef} className="print-only print-container" style={{ padding: '20px', color: '#000', backgroundColor: '#fff', fontFamily: 'Montserrat, sans-serif' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #D4AF37', paddingBottom: '20px', marginBottom: '30px' }}>
              <div>
                <h1 style={{ color: '#000', margin: 0, fontSize: '28px', textTransform: 'uppercase', letterSpacing: '2px' }}>Lunora Blinds</h1>
                <p style={{ margin: '5px 0 0 0', color: '#666' }}>Premium Custom Window Treatments</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ margin: 0, color: '#D4AF37' }}>QUOTE</h2>
                <p style={{ margin: '5px 0 0 0', fontWeight: 'bold' }}>Customer: {customerName}</p>
                <p style={{ margin: '5px 0 0 0', color: '#666' }}>Date: {new Date().toLocaleDateString()}</p>
              </div>
            </div>

            {/* Itemized List */}
            <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>Itemized Blinds</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', textAlign: 'left' }}>
                  <th style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>Location</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>Details</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #ccc', textAlign: 'right' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {blindsList.map(blind => (
                  <tr key={blind.id}>
                    <td style={{ padding: '10px', borderBottom: '1px solid #eee', textTransform: 'capitalize' }}><strong>{blind.location}</strong></td>
                    <td style={{ padding: '10px', borderBottom: '1px solid #eee', textTransform: 'capitalize' }}>
                      {blind.blindType} ({blind.mechanism})<br/>
                      <span style={{ color: '#666', fontSize: '12px' }}>
                        Color: {blind.colorCode}
                      </span>
                    </td>
                    <td style={{ padding: '10px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 'bold' }}>
                      ${calculateBlindPrice(blind).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Extras */}
            {extras.some(e => e.name && e.price > 0) && (
              <>
                <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>Additional Extras</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '14px' }}>
                  <tbody>
                    {extras.filter(e => e.name && e.price > 0).map((ex, i) => (
                      <tr key={i}>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{ex.name}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 'bold' }}>
                          ${ex.price.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
              <div style={{ width: '300px', backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Subtotal:</span>
                  <span>${getSubtotal().toFixed(2)}</span>
                </div>
                {getExtrasTotal() > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span>Extras:</span>
                    <span>${getExtrasTotal().toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #D4AF37', paddingTop: '10px', marginTop: '10px', fontSize: '18px', fontWeight: 'bold' }}>
                  <span>Total:</span>
                  <span>${getTotal().toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Terms */}
            <div style={{ borderTop: '1px solid #ccc', paddingTop: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#666' }}>Terms & Conditions</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#666', fontSize: '12px' }}>
                {settings.customTerms.filter(t => t.trim() !== "").map((term, i) => (
                  <li key={i} style={{ marginBottom: '5px' }}>{term}</li>
                ))}
              </ul>
            </div>

          </div>
      )}
    </main>
  );
}
