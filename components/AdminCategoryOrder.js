'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, Spinner } from './ui';


export default function AdminCategoryOrder() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [original, setOriginal] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
    if (window.location.pathname !== '/admin') return undefined;

    const syncTab = () => {
      const active = document.querySelector('.admin-nav button.active');
      setVisible(active?.textContent?.trim() === 'Canais');
    };
    syncTab();
    const observer = new MutationObserver(syncTab);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  async function loadCategories(currentSession = session) {
    if (!currentSession?.access_token) {
      setError('Sessão administrativa não encontrada.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/manage', { headers: {}, cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível carregar as categorias.');
      const seen = new Set();
      const ordered = (json.channels || [])
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((channel) => String(channel.category || 'GERAL').trim().toUpperCase() || 'GERAL')
        .filter((category) => !seen.has(category) && seen.add(category));
      setCategories(ordered);
      setOriginal(ordered);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  async function openManager() {
    setOpen(true);
    setError('');
    if (!isLoaded || !isSignedIn) { setError('Sessão administrativa não disponível.'); return; }
    setSession({ active: true });
    await loadCategories();
  }

  function move(index, direction) {
    setCategories((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setMessage('');
  }

  function reset() {
    setCategories(original);
    setMessage('');
  }

  const changed = useMemo(() => categories.join('\u0001') !== original.join('\u0001'), [categories, original]);

  async function save() {
    if (!session || !changed) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: undefined },
        body: JSON.stringify({ action: 'reorder-categories', categoryOrder: categories }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Não foi possível salvar a ordem.');
      setOriginal(json.categoryOrder || categories);
      setCategories(json.categoryOrder || categories);
      setMessage('Ordem das categorias salva.');
      window.dispatchEvent(new CustomEvent('cpx:channels-order-changed'));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || !visible || window.location.pathname !== '/admin') return null;

  const content = (
    <>
      <button
        type="button"
        className="secondary-btn button-sm"
        onClick={openManager}
        style={{ position: 'fixed', right: 24, top: 132, zIndex: 80, boxShadow: '0 10px 28px rgba(0,0,0,.28)' }}
      >
        ↕ Ordenar categorias
      </button>

      <Modal open={open} title="Ordenar categorias" onClose={() => setOpen(false)} width={520}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <strong style={{ color: '#fff' }}>Ordem das categorias</strong>
            <div className="helper" style={{ marginTop: 4, lineHeight: 1.5 }}>A ordem abaixo define como as categorias aparecem na lista de canais. Os canais dentro de cada categoria mantêm a ordem atual.</div>
          </div>

          {loading ? (
            <div style={{ padding: '28px 0' }}><Spinner label="Carregando categorias..." /></div>
          ) : error ? (
            <div className="admin-empty" style={{ color: '#ff9b9b' }}>{error}</div>
          ) : categories.length ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {categories.map((category, index) => (
                <div key={category} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, background: 'rgba(255,255,255,.025)' }}>
                  <span style={{ width: 24, color: 'var(--muted)', textAlign: 'center', fontSize: 11, fontWeight: 800 }}>{index + 1}</span>
                  <strong style={{ flex: 1, minWidth: 0, color: '#fff', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category}</strong>
                  <button type="button" className="secondary-btn button-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Mover ${category} para cima`}>↑</button>
                  <button type="button" className="secondary-btn button-sm" disabled={index === categories.length - 1} onClick={() => move(index, 1)} aria-label={`Mover ${category} para baixo`}>↓</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty">Nenhuma categoria encontrada.</div>
          )}

          {message && <div className="helper" style={{ color: '#8df0b7' }}>{message}</div>}

          <div className="modal-actions">
            <button type="button" className="ghost-btn" disabled={!changed || saving} onClick={reset}>Desfazer alterações</button>
            <button type="button" className="primary-btn" disabled={!changed || saving || !session} onClick={save}>{saving ? <Spinner label="Salvando..." /> : 'Salvar ordem'}</button>
          </div>
        </div>
      </Modal>
    </>
  );

  return createPortal(content, document.body);
}
