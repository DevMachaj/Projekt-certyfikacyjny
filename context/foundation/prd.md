---
project: StockHelper
version: 1
status: draft
created: 2026-05-24
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# StockHelper

## Vision & Problem Statement

Shop platforms (Shopify, WooCommerce, Etsy, and equivalents) surface sales history but never interpret it. The store owner standing at their warehouse or reviewing a supplier invoice must derive the reorder decision themselves — from raw totals, memory, and gut feeling. The interpretation step is missing.

The insight that makes StockHelper worth building: velocity classification, not more charts. The platform shows what sold; StockHelper decides what it means. It applies a rule the platform omits — is this item fast or slow relative to its own recent history and current stock level? — and turns that decision into a specific action recommendation (reorder or promote). That decision is the product.

The cost of the status quo is binary: either dead stock (cash and space locked into slow-movers the owner over-ordered) or stockouts (revenue killed on top-performing products that ran out before the next reorder arrived).

## User & Persona

### Primary persona

**Solo e-commerce store operator.** One person runs a single online shop end-to-end — product sourcing, inventory, fulfillment, customer service. No dedicated buying role, no ops team. Uses an existing shop platform (Shopify, WooCommerce, Etsy, or equivalent). Makes reorder decisions alone, typically under time pressure at supplier invoice moments or during a warehouse check.

## Success Criteria

### Primary

The owner can add a product (name, current stock quantity, supplier lead time, buffer days), enter sales data (units sold over a date range), and receive a classification (Understocked / Watch / OK / Slow-mover) plus a specific recommendation ("Order X units" or "Consider promotion") that correctly reflects the item's velocity. The full flow works end-to-end for at least one product.

### Secondary

A multi-product dashboard exists that lists all of the owner's products grouped by classification state (Understocked first, then Watch, then OK, then Slow-mover). Owners can see their whole catalog's health at a glance, not just one product at a time.

### Guardrails

- **Data isolation:** Each store owner's products, sales data, and recommendations are strictly isolated. No cross-account data leakage, even in error states.
- **Honest uncertainty:** When the app has fewer than 7 days of non-overlapping sales history for a product, it must show "Insufficient data" explicitly rather than emit a misleading classification label.

## User Stories

### US-01: Owner classifies a product by entering its sales data

- **Given** a logged-in owner who has added a product with stock quantity, lead time, and buffer days
- **When** they log one or more non-overlapping sales entries (units sold, date range) for that product
- **Then** the product displays a classification (Understocked / Watch / OK / Slow-mover) and a specific recommended action ("Order X units" or "Consider promotion")

#### Acceptance Criteria

- Classification updates within 1 second after the first valid sales entry is saved
- If total sales history covers fewer than 7 days, the product shows "Insufficient data" instead of a classification
- The UI shows the threshold definition for the assigned classification state
- Reorder recommendation includes a specific quantity computed as velocity × (lead_time + buffer_days)
- If lead time is not set, the app shows "Set lead time to get reorder suggestion" instead of a quantity

### US-02: Owner manages their product catalog

- **Given** a logged-in owner
- **When** they add, edit, or delete a product
- **Then** the product catalog reflects the change immediately and all associated classifications update accordingly

#### Acceptance Criteria

- Owner can add a product with name, stock quantity, lead time, and buffer days (default 7)
- Owner can edit any of those fields; classification recalculates on save
- Owner can delete a product with a confirmation prompt; all associated sales entries are permanently removed
- No other account can see or access the owner's products

### US-03: Owner corrects a wrong sales entry

- **Given** a logged-in owner who has logged a sales entry with incorrect data
- **When** they delete that entry
- **Then** the product's velocity and classification recalculate immediately based on the remaining entries

#### Acceptance Criteria

- Owner can delete any sales entry for their products
- Classification updates within 1 second of deletion
- If remaining entries cover fewer than 7 days, the product reverts to "Insufficient data"
- Deleted entries cannot be recovered (no undo at MVP)

## Functional Requirements

### Authentication

- **FR-001:** Owner can register an account (email + password or OAuth). Priority: must-have

  > Socrates: Counter-argument considered: "registration friction kills early adoption — a trial mode should come first." Resolution: kept as written; account registration is the right gate from day one for a data-persistent app.

- **FR-002:** Owner can log in and log out. Priority: must-have
  > Socrates: Counter-argument considered: "logout is rarely used by solo operators on a single device." Resolution: kept as written; login/logout is baseline and adds negligible implementation cost.

### Product management

- **FR-003:** Owner can add a product with the following fields: name, current stock quantity, supplier lead time (days), buffer days (default: 7, editable). Priority: must-have

  > Socrates: Delivery date removed — not needed for velocity calculation. Lead time and buffer days added — both required to compute reorder quantity in FR-007.

- **FR-004:** Owner can view and edit a product (name, stock quantity, lead time, buffer days). Priority: must-have

  > Socrates: Counter-argument considered: "edit is over-engineered — delete + re-add is sufficient." Resolution: kept as must-have; stock quantity and lead time change with every reorder delivery, making edit a routine operation, not a rare correction.

- **FR-011:** Owner can delete a product (with confirmation prompt). Deleting a product permanently removes all its associated sales entries. Priority: must-have
  > Socrates: Counter-argument considered: "delete is destructive — all sales history is lost." Resolution: kept as written; confirmation prompt is the guard. Archive pattern deferred to post-MVP.

### Sales entries

- **FR-005:** Owner can log a sales entry — units sold over a date range (start date to end date) — for a product. The app must reject any entry whose date range overlaps with an existing entry for the same product. Priority: must-have

  > Socrates: Counter-argument accepted: "overlapping date ranges silently corrupt velocity calculation." Resolution: overlap produces a validation error, not silent acceptance.

- **FR-012:** Owner can delete a sales entry for a product. Priority: must-have
  > Socrates: Counter-argument considered: "delete without audit trail corrupts velocity history silently." Resolution: kept as written; delete is the right correction mechanism for MVP. Audit trail deferred to post-MVP.

### Classification & recommendation

- **FR-006:** Owner can see a velocity-based classification for each product. Valid states: Understocked / Watch / OK / Slow-mover / Insufficient data. The UI must display the threshold definition for each state (e.g., "Understocked — fewer than lead_time days of stock remaining at current velocity"). Priority: must-have

  > Socrates: Counter-argument accepted: "states are ambiguous without visible threshold definitions." Resolution: transparent thresholds are load-bearing for trust in the algorithm.

- **FR-007:** Owner can see a specific recommended action for each classified product. For Understocked: "Order X units" where X = velocity × (lead_time_days + buffer_days). For Slow-movers: "Consider promotion." If lead time is not set, the app shows "Set lead time to get reorder suggestion" instead of a quantity. Priority: must-have

  > Socrates: Counter-argument accepted: "reorder quantity X is untrustworthy without lead time." Resolution: lead time is a required product field; formula is visible to the owner.

- **FR-008:** Owner is shown an explicit "Insufficient data" state when a product has fewer than 7 days of non-overlapping sales history. This state clears automatically once the threshold is met. Priority: must-have
  > Socrates: Counter-argument accepted: "threshold for 'insufficient' is undefined." Resolution: threshold locked at 7 days; visible in the UI.

### Dashboard

- **FR-009:** Owner can view all products grouped by classification state in fixed order: Understocked → Watch → OK → Slow-mover → Insufficient data. Within each group, products are sorted alphabetically. Priority: must-have
  > Socrates: Counter-argument accepted: "urgency sort hides an unresolved algorithmic decision — grouping by classification state is simpler and equally useful." Revision: changed from urgency-sort to classification-grouping.

## Non-Functional Requirements

- **NFR-001 — Performance:** Classification and recommended action update within 1 second of a sales entry being saved.
- **NFR-002 — Browser support:** The app is usable on the latest two major versions of Chrome, Firefox, Safari, and Edge. No mobile-first layout required for MVP.
- **NFR-003 — Data isolation:** A store owner's products, sales entries, and recommendations are never readable by any other account, including in error states or edge cases. Data isolation is an absolute property, not best-effort.

## Business Logic

StockHelper automatically classifies every product into an actionable state and generates a specific reorder quantity by combining real-time sales velocity, current stock level, and supplier lead time — a spreadsheet has the same data but requires the owner to write the formula, interpret the result, and decide the action themselves.

### Inputs (all owner-supplied)

| Field                     | Source        | Notes                                             |
| ------------------------- | ------------- | ------------------------------------------------- |
| Units sold + date range   | Sales entry   | Multiple entries per product allowed; no overlaps |
| Current stock quantity    | Product field | Owner updates after each delivery                 |
| Supplier lead time (days) | Product field | Required for reorder quantity                     |
| Buffer days               | Product field | Default 7 days, owner-overridable                 |

### Formulas

```
velocity (units/day)  = total units sold ÷ total calendar days covered by all non-overlapping entries
days_of_stock         = current_stock_quantity ÷ velocity
reorder_quantity      = velocity × (lead_time_days + buffer_days)
```

### Classification thresholds

| State             | Condition                                           |
| ----------------- | --------------------------------------------------- |
| Insufficient data | Fewer than 7 days of non-overlapping sales history  |
| Understocked      | days_of_stock < lead_time_days                      |
| Watch             | lead_time_days ≤ days_of_stock < 2 × lead_time_days |
| OK                | 2 × lead_time_days ≤ days_of_stock < 90 days        |
| Slow-mover        | days_of_stock ≥ 90 days OR velocity < 0.1 units/day |

### Validation rules

- A new sales entry is rejected if its date range overlaps with any existing entry for the same product.
- Classification is not produced until the minimum data threshold (7 days) is met.
- Reorder quantity is not shown if lead time is not set on the product.

### Output

After saving any sales entry, the product card shows the updated classification and recommended action within 1 second. The dashboard groups all products by classification state — Understocked first, then Watch, then OK, then Slow-mover, then Insufficient data.

## Access Control

Store owners authenticate via email + password or OAuth. Accounts are server-side; data is accessible from any device.

Flat user model for MVP: one account maps to one store. No role separation — the account owner has full access to all features. No admin, member, or guest roles needed at launch.

## Non-Goals

- **No shop platform integrations** — sales data is entered manually. No API sync or webhook listeners for shop platforms.
- **No multi-store management** — one account manages exactly one store. No switch-store UI or cross-store aggregates.
- **No demand forecasting** — StockHelper classifies current inventory state from historical data, and AI generates a restocking summary from those current classifications. It does NOT predict future demand, project future velocity, or model seasonality.
- **No purchasing action execution** — the app generates a recommendation only. No purchase orders, supplier emails, or procurement tool integrations.
- **No mobile layout** — desktop browsers only. No touch UX, small-screen layouts, or PWA features.

## Open Questions

None. All elements captured during shaping — quality check status: accepted (all 5 greenfield gates passed).
