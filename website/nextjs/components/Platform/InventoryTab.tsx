'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Boxes,
  ExternalLink,
  PackagePlus,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Wrench,
} from 'lucide-react'
import {
  api,
  type ComponentCategory,
  type ComponentOrder,
  type InventoryComponent,
  type OrderStatus,
  type Prototype,
  type PrototypeStatus,
} from '@/lib/api'
import {
  formatMoney,
  groupByCategory,
  lowStockComponents,
  orderCostByStatus,
  stockValue,
} from '@/lib/inventory'
import { useToast } from '@/components/Platform/Toast'

const CATEGORIES: ComponentCategory[] = [
  'flight-controller', 'motor', 'esc', 'battery', 'propeller', 'frame',
  'camera', 'sensor', 'companion-computer', 'radio', 'gps', 'wiring', 'other',
]
const PROTO_STATUSES: PrototypeStatus[] = ['planning', 'building', 'active', 'retired']
const ORDER_STATUSES: OrderStatus[] = ['planned', 'ordered', 'received', 'cancelled']

function Chip({ label, value, tone }: { label: string; value: string; tone: 'info' | 'ok' | 'crit' | 'muted' }) {
  return (
    <div className={`chip chip-${tone}`}>
      <span className="chip-label">{label}</span>
      <span className="chip-value">{value}</span>
    </div>
  )
}

function errMessage(err: unknown): string {
  if (err instanceof Error) {
    // Surface the API's JSON `detail` when present (e.g. availability errors)
    const m = err.message.match(/"detail"\s*:\s*"([^"]+)"/)
    if (m) return m[1]
    return err.message
  }
  return String(err)
}

// ── Components section ────────────────────────────────────────────────────────

function AddComponentForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ComponentCategory>('other')
  const [qty, setQty] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [vendor, setVendor] = useState('')
  const [link, setLink] = useState('')

  async function submit() {
    if (!name.trim()) {
      toast.error('Component name is required')
      return
    }
    setIsBusy(true)
    try {
      await api.createComponent({
        name: name.trim(),
        category,
        qty_total: Math.max(0, Number(qty) || 0),
        unit_cost: unitCost ? Number(unitCost) : null,
        vendor: vendor.trim() || null,
        link: link.trim() || null,
      })
      setName(''); setQty('1'); setUnitCost(''); setVendor(''); setLink('')
      setIsOpen(false)
      onCreated()
    } catch (err) {
      toast.error(errMessage(err))
    } finally {
      setIsBusy(false)
    }
  }

  if (!isOpen) {
    return (
      <button type="button" className="secondary" onClick={() => setIsOpen(true)}>
        <Plus size={15} /> Add component
      </button>
    )
  }
  return (
    <div className="inv-form">
      <input placeholder="Part name *" value={name} onChange={(e) => setName(e.target.value)} />
      <select value={category} onChange={(e) => setCategory(e.target.value as ComponentCategory)}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input type="number" min={0} placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
      <input type="number" min={0} placeholder="Unit cost ₹" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
      <input placeholder="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
      <input placeholder="Product link" value={link} onChange={(e) => setLink(e.target.value)} />
      <div className="inv-form-actions">
        <button type="button" className="primary" disabled={isBusy} onClick={submit}>Save</button>
        <button type="button" className="secondary" onClick={() => setIsOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}

function ComponentsPanel({
  components,
  onChanged,
}: {
  components: InventoryComponent[]
  onChanged: () => void
}) {
  const toast = useToast()

  async function adjustQty(c: InventoryComponent, delta: number) {
    const next = c.qty_total + delta
    if (next < c.qty_assigned) {
      toast.error(`${c.qty_assigned} unit(s) are installed in prototypes`)
      return
    }
    try {
      await api.updateComponent(c.id, { qty_total: next })
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function remove(c: InventoryComponent) {
    if (!window.confirm(`Delete "${c.name}" from inventory?`)) return
    try {
      await api.deleteComponent(c.id)
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title"><Boxes size={15} /> Components</div>
          <p>{components.length} part type(s) · stock value {formatMoney(stockValue(components), 'INR')}</p>
        </div>
        <AddComponentForm onCreated={onChanged} />
      </div>

      {components.length === 0 && <div className="empty">No components yet — add your first part above.</div>}

      {groupByCategory(components).map(([category, items]) => (
        <div key={category} className="inv-group">
          <div className="inv-group-title">{category}</div>
          <div className="table">
            <div className="table-head inv-head">
              <span>Part</span>
              <span>Stock</span>
              <span>Installed</span>
              <span>Unit cost</span>
              <span />
            </div>
            {items.map((c) => (
              <div className="inv-row" key={c.id}>
                <span className="inv-part">
                  <strong>{c.name}</strong>
                  <small>
                    {c.vendor || '—'}
                    {c.link && (
                      <a href={c.link} target="_blank" rel="noopener noreferrer" title="Product page">
                        {' '}<ExternalLink size={11} />
                      </a>
                    )}
                  </small>
                </span>
                <span className={c.qty_available < 1 ? 'inv-stock low' : 'inv-stock'}>
                  <button type="button" className="inv-step" onClick={() => adjustQty(c, -1)} title="Remove one">−</button>
                  {c.qty_available} / {c.qty_total}
                  <button type="button" className="inv-step" onClick={() => adjustQty(c, +1)} title="Add one">+</button>
                </span>
                <span>{c.qty_assigned > 0 ? `${c.qty_assigned} installed` : '—'}</span>
                <span>{formatMoney(c.unit_cost, c.currency)}</span>
                <button type="button" className="inv-icon-btn" onClick={() => remove(c)} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

// ── Prototypes section ────────────────────────────────────────────────────────

function AssignForm({
  prototype,
  components,
  onChanged,
}: {
  prototype: Prototype
  components: InventoryComponent[]
  onChanged: () => void
}) {
  const toast = useToast()
  const available = components.filter((c) => c.qty_available > 0)
  const [componentId, setComponentId] = useState('')
  const [qty, setQty] = useState('1')

  async function submit() {
    if (!componentId) return
    try {
      await api.createAssignment({
        component_id: Number(componentId),
        prototype_id: prototype.id,
        qty: Math.max(1, Number(qty) || 1),
      })
      setComponentId(''); setQty('1')
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  if (available.length === 0) return null
  return (
    <div className="inv-assign-form">
      <select value={componentId} onChange={(e) => setComponentId(e.target.value)}>
        <option value="">Install a component…</option>
        {available.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.qty_available} avail.)</option>
        ))}
      </select>
      <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
      <button type="button" className="secondary" disabled={!componentId} onClick={submit}>
        <Wrench size={13} /> Install
      </button>
    </div>
  )
}

function PrototypeCard({
  prototype,
  components,
  onChanged,
}: {
  prototype: Prototype
  components: InventoryComponent[]
  onChanged: () => void
}) {
  const toast = useToast()

  async function setStatus(status: PrototypeStatus) {
    try {
      await api.updatePrototype(prototype.id, { status })
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function unassign(assignmentId: number) {
    try {
      await api.deleteAssignment(assignmentId)
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function remove() {
    if (!window.confirm(`Delete prototype "${prototype.name}"? Its components return to stock.`)) return
    try {
      await api.deletePrototype(prototype.id)
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  return (
    <div className="inv-proto-card">
      <div className="inv-proto-head">
        <div>
          <strong>{prototype.name}</strong>
          {prototype.description && <p>{prototype.description}</p>}
        </div>
        <div className="inv-proto-controls">
          <select
            value={prototype.status}
            className={`inv-status inv-status-${prototype.status}`}
            onChange={(e) => setStatus(e.target.value as PrototypeStatus)}
          >
            {PROTO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="inv-icon-btn" onClick={remove} title="Delete prototype">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {prototype.assignments.length === 0 && (
        <div className="inv-bom-empty">No components installed yet.</div>
      )}
      {prototype.assignments.length > 0 && (
        <ul className="inv-bom">
          {prototype.assignments.map((a) => (
            <li key={a.id}>
              <span className="inv-bom-cat">{a.component_category || 'part'}</span>
              <span className="inv-bom-name">{a.component_name}</span>
              <span className="inv-bom-qty">×{a.qty}</span>
              <button type="button" className="inv-icon-btn" onClick={() => unassign(a.id)} title="Return to stock">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AssignForm prototype={prototype} components={components} onChanged={onChanged} />
    </div>
  )
}

function PrototypesPanel({
  prototypes,
  components,
  onChanged,
}: {
  prototypes: Prototype[]
  components: InventoryComponent[]
  onChanged: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function create() {
    if (!name.trim()) {
      toast.error('Prototype name is required')
      return
    }
    try {
      await api.createPrototype({
        name: name.trim(),
        description: description.trim() || null,
      })
      setName(''); setDescription('')
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title"><Wrench size={15} /> Prototypes & builds</div>
          <p>{prototypes.length} build(s) — each card lists exactly which components it contains</p>
        </div>
      </div>

      <div className="inv-form">
        <input placeholder="New prototype name *" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Description (e.g. thermal quad, 7-inch frame)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="inv-form-actions">
          <button type="button" className="primary" onClick={create}><Plus size={14} /> Create</button>
        </div>
      </div>

      {prototypes.length === 0 && <div className="empty">No prototypes yet.</div>}
      <div className="inv-proto-grid">
        {prototypes.map((p) => (
          <PrototypeCard key={p.id} prototype={p} components={components} onChanged={onChanged} />
        ))}
      </div>
    </section>
  )
}

// ── Orders section ────────────────────────────────────────────────────────────

function OrdersPanel({
  orders,
  components,
  onChanged,
}: {
  orders: ComponentOrder[]
  components: InventoryComponent[]
  onChanged: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [componentId, setComponentId] = useState('')
  const [qty, setQty] = useState('1')
  const [estCost, setEstCost] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const totals = orderCostByStatus(orders)

  async function create() {
    if (!name.trim() && !componentId) {
      toast.error('Give the order a name or link it to a component')
      return
    }
    try {
      await api.createOrder({
        name: name.trim() || undefined,
        component_id: componentId ? Number(componentId) : null,
        qty: Math.max(1, Number(qty) || 1),
        est_unit_cost: estCost ? Number(estCost) : null,
        needed_by: neededBy || null,
      })
      setName(''); setComponentId(''); setQty('1'); setEstCost(''); setNeededBy('')
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function setStatus(o: ComponentOrder, status: OrderStatus) {
    try {
      await api.updateOrder(o.id, { status })
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function remove(o: ComponentOrder) {
    try {
      await api.deleteOrder(o.id)
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title"><ShoppingCart size={15} /> Order planning</div>
          <p>
            Planned {formatMoney(totals.planned, 'INR')} · Ordered {formatMoney(totals.ordered, 'INR')}
            {' '}· Committed {formatMoney(totals.total, 'INR')}
          </p>
        </div>
      </div>

      <div className="inv-form">
        <input placeholder="Item to order *" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={componentId} onChange={(e) => setComponentId(e.target.value)}>
          <option value="">Restock existing part…</option>
          {components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="number" min={1} placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input type="number" min={0} placeholder="Est. unit cost ₹" value={estCost} onChange={(e) => setEstCost(e.target.value)} />
        <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} title="Needed by" />
        <div className="inv-form-actions">
          <button type="button" className="primary" onClick={create}><PackagePlus size={14} /> Plan order</button>
        </div>
      </div>

      {orders.length === 0 && <div className="empty">Nothing in the order queue.</div>}
      {orders.length > 0 && (
        <div className="table">
          <div className="table-head inv-order-head">
            <span>Item</span>
            <span>Qty</span>
            <span>Est. cost</span>
            <span>Needed by</span>
            <span>Status</span>
            <span />
          </div>
          {orders.map((o) => (
            <div className="inv-order-row" key={o.id}>
              <span className="inv-part">
                <strong>{o.name}</strong>
                {o.component_id != null && <small>restock → stocks in on receive</small>}
              </span>
              <span>×{o.qty}</span>
              <span>{formatMoney(o.est_unit_cost != null ? o.est_unit_cost * o.qty : null, 'INR')}</span>
              <span>{o.needed_by || '—'}</span>
              <span>
                <select
                  value={o.status}
                  className={`inv-status inv-status-${o.status}`}
                  onChange={(e) => setStatus(o, e.target.value as OrderStatus)}
                >
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </span>
              <button type="button" className="inv-icon-btn" onClick={() => remove(o)} title="Delete order">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Tab root ──────────────────────────────────────────────────────────────────

export function InventoryTab() {
  const toast = useToast()
  const [components, setComponents] = useState<InventoryComponent[]>([])
  const [prototypes, setPrototypes] = useState<Prototype[]>([])
  const [orders, setOrders] = useState<ComponentOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const [comps, protos, ords] = await Promise.all([
        api.inventoryComponents(),
        api.prototypes(),
        api.orders(),
      ])
      setComponents(comps)
      setPrototypes(protos)
      setOrders(ords)
    } catch (err) {
      toast.error(errMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reload()
  }, [reload])

  const low = lowStockComponents(components)
  const openOrders = orders.filter((o) => o.status === 'planned' || o.status === 'ordered')

  return (
    <section className="tab-section">
      <header className="cmdbar">
        <div className="cmdbar-titles">
          <div className="eyebrow">
            <Boxes size={13} />
            hardware tracking
          </div>
          <h1>Inventory</h1>
        </div>
        <div className="chips">
          <Chip label="Parts" value={String(components.length)} tone="info" />
          <Chip label="Prototypes" value={String(prototypes.length)} tone="info" />
          <Chip label="Stock value" value={formatMoney(stockValue(components), 'INR')} tone="ok" />
          <Chip label="Out of stock" value={String(low.length)} tone={low.length ? 'crit' : 'muted'} />
          <Chip label="Open orders" value={String(openOrders.length)} tone="muted" />
          <button type="button" className="inv-icon-btn" onClick={reload} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {isLoading && <div className="empty">Loading inventory…</div>}
      {!isLoading && (
        <div className="inv-layout">
          <ComponentsPanel components={components} onChanged={reload} />
          <PrototypesPanel prototypes={prototypes} components={components} onChanged={reload} />
          <OrdersPanel orders={orders} components={components} onChanged={reload} />
        </div>
      )}
    </section>
  )
}
