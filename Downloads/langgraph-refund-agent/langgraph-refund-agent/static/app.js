(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const DECISION_LABELS = {
    approved: 'Approved',
    recorded: 'Recorded',
    rejected: 'Rejected',
    review: 'Needs review',
    failed: 'Failed',
    not_found: 'Not found',
    missing_order: 'Missing order',
    information_only: 'Information',
    general: 'General',
  };

  const state = { threadId: null, busy: false, awaiting: false };

  // ---------- helpers ----------
  const newThreadId = () => `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const money = (n) => `$${Number(n).toFixed(2)}`;
  const timeNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data && data.detail;
      throw new Error(typeof detail === 'string' ? detail : `Request failed (HTTP ${res.status})`);
    }
    return data;
  }

  function toast(message, type = 'info') {
    const el = $('toast');
    el.textContent = message;
    el.className = `toast ${type}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add('hidden'), 3500);
  }

  function log(text, type = 'info') {
    const li = document.createElement('li');
    const time = document.createElement('time');
    const span = document.createElement('span');
    time.textContent = timeNow();
    span.className = type;
    span.textContent = text;
    li.append(time, span);
    $('log').prepend(li);
  }

  function logKindFor(decision) {
    if (['approved', 'recorded'].includes(decision)) return 'success';
    if (['rejected', 'failed', 'not_found', 'missing_order'].includes(decision)) return 'error';
    return 'info';
  }

  function setThread(id) {
    state.threadId = id;
    $('threadId').textContent = id || '—';
  }

  function fillMessage(text) {
    const box = $('message');
    box.value = text;
    box.focus();
  }

  // Renders **bold** safely as DOM nodes (no innerHTML, so no injection risk).
  function renderRich(el, text) {
    el.replaceChildren();
    for (const part of String(text).split(/(\*\*[^*]+\*\*)/g)) {
      if (!part) continue;
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        el.append(strong);
      } else {
        el.append(document.createTextNode(part));
      }
    }
  }

  function setBusy(busy, label = 'Sending…') {
    state.busy = busy;
    const btn = $('sendBtn');
    btn.disabled = busy || state.awaiting;
    btn.replaceChildren();
    if (busy) {
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      btn.append(spinner, label);
    } else {
      btn.textContent = 'Send request';
    }
    $('approveBtn').disabled = busy;
    $('rejectBtn').disabled = busy;
  }

  // ---------- rendering ----------
  function renderResult(data) {
    state.awaiting = data.status === 'awaiting_approval';
    const decision = data.decision || 'general';

    const badge = $('decisionBadge');
    badge.textContent = DECISION_LABELS[decision] || decision;
    badge.className = `badge ${decision}`;

    $('statusText').textContent = state.awaiting ? 'Awaiting reviewer' : 'Completed';

    if (state.awaiting) {
      $('responseText').textContent = 'The agent has paused. A human reviewer must approve or reject this refund.';
    } else {
      renderRich(
        $('responseText'),
        data.response || 'No reply was generated.'
      );
    }

    $('resultEmpty').classList.add('hidden');
    const result = $('result');
    result.classList.remove('hidden');
    result.style.animation = 'none';
    void result.offsetWidth; // restart the entrance animation
    result.style.animation = '';

    const panel = $('reviewPanel');
    panel.classList.toggle('hidden', !state.awaiting);
    if (state.awaiting) {
      const info = (data.interrupts && data.interrupts[0]) || {};
      $('reviewInfo').textContent = `Order ${info.order_id} · ${money(info.amount)} · "${info.message}"`;
    }
    $('sendBtn').disabled = state.awaiting || state.busy;
  }

  function resetResult() {
    state.awaiting = false;
    $('result').classList.add('hidden');
    $('resultEmpty').classList.remove('hidden');
    $('reviewPanel').classList.add('hidden');
    $('statusText').textContent = '';
    setThread(null);
  }

  function cell(text, className = '') {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  function statusPill(status) {
    const span = document.createElement('span');
    span.className = `pill ${status}`;
    span.textContent = status;
    return span;
  }

  function refundPill(refundStatus) {
    const span = document.createElement('span');
    const refunded = refundStatus === 'refunded';
    span.className = `pill ${refunded ? 'refunded' : ''}`;
    span.textContent = refunded ? 'Refunded' : 'None';
    return span;
  }

  function orderRow(order) {
    const tr = document.createElement('tr');
    tr.title = 'Click to draft a refund request';

    const id = cell(order.order_id, 'order-id');
    const amount = cell(money(order.amount), 'num');
    const status = document.createElement('td');
    status.append(statusPill(order.status));
    const refund = document.createElement('td');
    refund.append(refundPill(order.refund_status));

    tr.append(id, cell(order.product), amount, cell(order.delivery_date || '—'), status, refund);
    tr.addEventListener('click', () => fillMessage(`Please refund ${order.order_id}`));
    return tr;
  }

  function updateStats(orders) {
    const refunded = orders.filter((o) => o.refund_status === 'refunded').length;
    const open = orders.filter((o) => o.refund_status === 'none' && o.status === 'delivered');
    const review = open.filter((o) => o.amount > 100).length;
    const eligible = open.filter((o) => o.amount <= 100).length;

    $('statTotal').textContent = orders.length;
    $('statRefunded').textContent = refunded;
    $('statReview').textContent = review;
    $('statEligible').textContent = eligible;
  }

  // ---------- actions ----------
  async function loadOrders() {
    try {
      const orders = await api('/orders');
      $('ordersBody').replaceChildren(...orders.map(orderRow));
      $('orderCount').textContent = `(${orders.length})`;
      updateStats(orders);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function checkHealth() {
    const pill = $('serverStatus');
    try {
      await api('/health');
      pill.className = 'status online';
      pill.lastElementChild.textContent = 'API online';
    } catch {
      pill.className = 'status offline';
      pill.lastElementChild.textContent = 'API offline';
    }
  }

  async function submitRequest(event) {
    event.preventDefault();
    const message = $('message').value.trim();
    if (!message || state.busy) return;
    if (state.awaiting) {
      toast('Finish the pending approval first.', 'error');
      return;
    }

    const threadId = newThreadId();
    setThread(threadId);
    setBusy(true, 'Running agent…');
    log(`New request → ${threadId}`);

    try {
      const data = await api('/support', {
        method: 'POST',
        body: JSON.stringify({ message, thread_id: threadId }),
      });
      renderResult(data);
      $('message').value = '';

      if (state.awaiting) {
        log(`${threadId} paused for human approval`);
      } else {
        log(`${threadId}: ${DECISION_LABELS[data.decision] || data.decision}`, logKindFor(data.decision));
      }
      loadOrders();
    } catch (err) {
      toast(err.message, 'error');
      log(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function review(approved) {
    if (!state.threadId || !state.awaiting || state.busy) return;
    setBusy(true, approved ? 'Approving…' : 'Rejecting…');

    try {
      const data = await api(`/review/${encodeURIComponent(state.threadId)}`, {
        method: 'POST',
        body: JSON.stringify({ approved }),
      });
      renderResult(data);
      log(`Reviewer ${approved ? 'approved' : 'rejected'} ${state.threadId}`, approved ? 'success' : 'error');
      toast(approved ? 'Refund approved' : 'Refund rejected');
      loadOrders();
    } catch (err) {
      toast(err.message, 'error');
      log(err.message, 'error');
      if (err.message.startsWith('No pending')) resetResult();
    } finally {
      setBusy(false);
    }
  }

  // ---------- init ----------
  function init() {
    $('supportForm').addEventListener('submit', submitRequest);

    $('message').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        $('supportForm').requestSubmit();
      }
    });

    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => fillMessage(chip.dataset.msg));
    });

    $('approveBtn').addEventListener('click', () => review(true));
    $('rejectBtn').addEventListener('click', () => review(false));
    $('refreshOrders').addEventListener('click', loadOrders);
    $('clearLog').addEventListener('click', () => $('log').replaceChildren());

    $('newThreadBtn').addEventListener('click', () => {
      if (state.awaiting) {
        toast('Finish the pending approval first.', 'error');
        return;
      }
      $('message').value = '';
      resetResult();
    });

    checkHealth();
    loadOrders();
    setInterval(checkHealth, 15000);
  }

  init();
})();