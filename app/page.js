"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const DEFAULT_BLIND_TYPES = ["Roller", "Zebra", "Roman", "Cellular", "Wood"];

export default function Home() {
  // Customer State
  const [customerName, setCustomerName] = useState("");
  
  // Current Blind State
  const [location, setLocation] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [mountType, setMountType] = useState("Inside");
  const [colorCode, setColorCode] = useState("");
  const [mechanism, setMechanism] = useState("Manual");
  const [blindType, setBlindType] = useState("");
  const [notes, setNotes] = useState("");

  // Blinds List (Cart) State
  const [blindsList, setBlindsList] = useState([]);
  const [editingBlindId, setEditingBlindId] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '', url: '' }

  // Customer Fetching State
  const [existingCustomers, setExistingCustomers] = useState([]);
  const [loadedCustomer, setLoadedCustomer] = useState(null);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [blindTypes, setBlindTypes] = useState([]);
  const [newBlindType, setNewBlindType] = useState("");

  useEffect(() => {
    // Load blind types from local storage on mount
    const stored = localStorage.getItem("lunora_blind_types");
    if (stored) {
      const parsed = JSON.parse(stored);
      setBlindTypes(parsed);
      if (parsed.length > 0) setBlindType(parsed[0]);
    } else {
      setBlindTypes(DEFAULT_BLIND_TYPES);
      setBlindType(DEFAULT_BLIND_TYPES[0]);
    }

    // Load existing customers from the master spreadsheet
    fetch('/api/sheets')
      .then(res => res.json())
      .then(data => {
        if (data.customers) setExistingCustomers(data.customers);
      })
      .catch(console.error);
  }, []);

  // When customerName changes, load their existing data if they match a past customer
  useEffect(() => {
    if (existingCustomers.includes(customerName) && loadedCustomer !== customerName) {
      setIsLoadingCustomer(true);
      fetch(`/api/sheets?customer=${encodeURIComponent(customerName)}`)
        .then(res => res.json())
        .then(data => {
          if (data.blinds) setBlindsList(data.blinds);
          setLoadedCustomer(customerName);
        })
        .catch(console.error)
        .finally(() => setIsLoadingCustomer(false));
    } else if (!existingCustomers.includes(customerName)) {
      if (loadedCustomer) {
        setBlindsList([]); // Clear if they start typing a completely new name
        setLoadedCustomer(null);
      }
    }
  }, [customerName, existingCustomers, loadedCustomer]);

  const saveBlindTypes = (types) => {
    setBlindTypes(types);
    localStorage.setItem("lunora_blind_types", JSON.stringify(types));
    if (!types.includes(blindType) && types.length > 0) {
      setBlindType(types[0]);
    } else if (types.length === 0) {
      setBlindType("");
    }
  };

  const handleAddBlindType = (e) => {
    e.preventDefault();
    if (!newBlindType.trim()) return;
    if (blindTypes.includes(newBlindType.trim())) return;
    
    saveBlindTypes([...blindTypes, newBlindType.trim()]);
    setNewBlindType("");
  };

  const handleDeleteBlindType = (typeToRemove) => {
    const updated = blindTypes.filter(t => t !== typeToRemove);
    saveBlindTypes(updated);
  };

  const handleAddBlind = (e) => {
    e.preventDefault();

    if (editingBlindId) {
      const updatedBlinds = blindsList.map(b => 
        b.id === editingBlindId ? {
          ...b, location, width, height, mountType, colorCode, mechanism, blindType, notes
        } : b
      );
      setBlindsList(updatedBlinds);
      setEditingBlindId(null);
    } else {
      const newBlind = {
        id: Date.now(),
        location, width, height, mountType, colorCode, mechanism, blindType, notes
      };
      setBlindsList([...blindsList, newBlind]);
    }
    
    // Clear the blind input fields for the next one
    setLocation("");
    setWidth("");
    setHeight("");
    setColorCode("");
    setNotes("");
  };

  const handleEditBlind = (blind) => {
    setLocation(blind.location);
    setWidth(blind.width);
    setHeight(blind.height);
    setMountType(blind.mountType);
    setColorCode(blind.colorCode);
    setMechanism(blind.mechanism);
    setBlindType(blind.blindType);
    setNotes(blind.notes || "");
    setEditingBlindId(blind.id);
    
    // Scroll to form smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRemoveBlind = (id) => {
    setBlindsList(blindsList.filter(b => b.id !== id));
  };

  const handleSubmitCustomer = async () => {
    if (!customerName) {
      alert("Please enter a customer name.");
      return;
    }
    if (blindsList.length === 0) {
      alert("Please add at least one blind to the list.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          blinds: blindsList
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit data');
      }

      setMessage({ 
        type: 'success', 
        text: `Success! Created sheet for ${customerName}.`,
        url: data.spreadsheetUrl
      });
      
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextCustomer = () => {
    // Completely reset everything
    setCustomerName("");
    setLoadedCustomer(null);
    setBlindsList([]);
    setLocation("");
    setWidth("");
    setHeight("");
    setColorCode("");
    setNotes("");
    setEditingBlindId(null);
    setMessage(null);
  };

  return (
    <main className="container">
      <header className="header">
        <h1>Lunora Blinds</h1>
        <p>Premium Measurement & Order System</p>
      </header>

      <button className="settings-btn" onClick={() => setIsSettingsOpen(true)}>
        ⚙️ Settings
      </button>

      {message && (
        <div className={`message ${message.type}`}>
          <p>{message.text}</p>
          {message.url && (
            <a href={message.url} target="_blank" rel="noreferrer" style={{color: 'white', display: 'inline-block', marginTop: '0.5rem'}}>
              Open Google Sheet
            </a>
          )}
        </div>
      )}

      {/* CUSTOMER INFO SECTION */}
      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--primary-gold)' }}>Customer Information</h2>
        <div className="form-group">
          <label>Customer Name / Identifier</label>
          <input 
            type="text" 
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="e.g. John Doe - Master Bedroom" 
            disabled={(message && message.type === 'success') || isLoadingCustomer}
            list="customers-list"
          />
          <datalist id="customers-list">
            {existingCustomers.map(c => <option key={c} value={c} />)}
          </datalist>
          {isLoadingCustomer && <p style={{color: 'var(--primary-gold)', fontSize: '0.85rem', marginTop: '0.5rem'}}>Loading existing customer data...</p>}
        </div>
      </div>

      {/* BLIND ENTRY SECTION */}
      {(!message || message.type !== 'success') && (
        <div className="glass-panel" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1rem', color: 'var(--primary-gold)' }}>Add a Blind</h2>
          <form onSubmit={handleAddBlind}>
            <div className="form-row">
              <div className="form-group">
                <label>Location in House</label>
                <input 
                  type="text" 
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Living Room Window 1" 
                />
              </div>
              <div className="form-group">
                <label>Blind Type</label>
                <select 
                  value={blindType} 
                  onChange={e => setBlindType(e.target.value)}
                >
                  {blindTypes.length === 0 && <option value="">No types available</option>}
                  {blindTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Width (inches)</label>
                <input 
                  type="text" 
                  value={width}
                  onChange={e => setWidth(e.target.value)}
                  placeholder="e.g. 34.5" 
                />
              </div>
              <div className="form-group">
                <label>Height (inches)</label>
                <input 
                  type="text" 
                  value={height}
                  onChange={e => setHeight(e.target.value)}
                  placeholder="e.g. 72" 
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Mount Type</label>
                <select value={mountType} onChange={e => setMountType(e.target.value)}>
                  <option value="Inside">Inside Mount</option>
                  <option value="Outside">Outside Mount</option>
                </select>
              </div>
              <div className="form-group">
                <label>Mechanism</label>
                <select value={mechanism} onChange={e => setMechanism(e.target.value)}>
                  <option value="Manual">Manual</option>
                  <option value="Motorized">Motorized</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Color Code / Name</label>
              <input 
                type="text" 
                value={colorCode}
                onChange={e => setColorCode(e.target.value)}
                placeholder="e.g. Ivory White #001" 
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Notes (Optional)</label>
              <textarea 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special instructions or details..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: 'var(--input-bg)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  color: 'white',
                  fontFamily: 'inherit',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
              />
            </div>

            <button type="submit" disabled={blindTypes.length === 0}>
              {editingBlindId ? "Update Blind Details" : "+ Add Blind to Order"}
            </button>
          </form>
        </div>
      )}

      {/* SUMMARY LIST SECTION */}
      {blindsList.length > 0 && (
        <div className="glass-panel" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1rem', color: 'var(--primary-gold)' }}>
            Blinds List ({blindsList.length})
          </h2>
          <div className="item-list" style={{ maxHeight: 'none', marginBottom: '2rem' }}>
            {blindsList.map(b => (
              <div className="list-item" key={b.id}>
                <div>
                  <strong>{b.location}</strong> - {b.blindType} ({b.width}" x {b.height}")<br/>
                  <span style={{fontSize: '0.8rem', opacity: 0.7}}>
                    {b.mountType} Mount | {b.mechanism} | Color: {b.colorCode}
                  </span>
                  {b.notes && (
                    <div style={{fontSize: '0.8rem', color: 'var(--primary-gold)', marginTop: '4px', fontStyle: 'italic'}}>
                      Notes: {b.notes}
                    </div>
                  )}
                </div>
                {(!message || message.type !== 'success') && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button 
                      type="button"
                      onClick={() => handleEditBlind(b)}
                      title="Edit Blind"
                      style={{ background: 'transparent', border: 'none', color: 'var(--primary-gold)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem' }}
                    >
                      ✎
                    </button>
                    <button 
                      type="button"
                      className="delete-btn" 
                      onClick={() => handleRemoveBlind(b.id)}
                      title="Remove Blind"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {(!message || message.type !== 'success') ? (
            <button onClick={handleSubmitCustomer} disabled={isSubmitting || isLoadingCustomer}>
              {isSubmitting ? 'Syncing...' : (existingCustomers.includes(customerName) ? 'Update Customer Sheet' : 'Finalize Customer & Create Sheet')}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={handleNextCustomer} style={{ backgroundColor: 'var(--foreground)', color: 'var(--background)', flex: 1}}>
                Next Customer
              </button>
              <Link href="/quote" style={{ flex: 1 }}>
                <button style={{ width: '100%', height: '100%' }}>Generate Quote</button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Settings Modal */}
      <div className={`modal-overlay ${isSettingsOpen ? 'open' : ''}`}>
        <div className="modal-content glass-panel">
          <h2>Manage Blind Types</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Add or remove blind types from the dropdown menu.
          </p>

          <form className="add-form" onSubmit={handleAddBlindType}>
            <input 
              type="text" 
              value={newBlindType}
              onChange={e => setNewBlindType(e.target.value)}
              placeholder="New blind type..." 
            />
            <button type="submit">Add</button>
          </form>

          <div className="item-list">
            {blindTypes.map(type => (
              <div className="list-item" key={type}>
                <span>{type}</span>
                <button 
                  className="delete-btn" 
                  onClick={() => handleDeleteBlindType(type)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
            {blindTypes.length === 0 && (
              <p style={{ textAlign: 'center', opacity: 0.5, marginTop: '1rem' }}>No blind types available.</p>
            )}
          </div>

          <button className="close-modal" onClick={() => setIsSettingsOpen(false)}>
            Close Settings
          </button>
        </div>
      </div>
    </main>
  );
}
