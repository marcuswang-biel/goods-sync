# 物資

物資 is a shared-shelf board for people who keep food and supplies in one place: flatmates, a couple, or an office tea room. It shows what is about to expire, what is under the safety line, and a shopping list with one total per trip. A phone in front of the fridge can take one carton even when the shop has no signal; when the network returns, those takes merge with everyone else's by causal order and timestamp.

## Language

**Space (空間)**:
The one shared place the members keep stock in.
_Avoid_: workspace, tenant, account

**Member (成員)**:
A signed-in user who can read and change one space. Stored as the auth token subject. The label is the name the shelf shows (凱, 阿澄).
_Avoid_: owner (a space is shared), user id

**Item (物資)**:
One public good on a shelf: a name, a unit, a quantity, a safety line, an optional expiry date.
_Avoid_: product, SKU, claim

**Opening quantity (期初數量)**:
The quantity the item started at. Current quantity is the replay of every movement from this number, not a value edited in place.

**Movement (領用)**:
One consume or restock. It records who did it, when their phone says it happened, the version they thought they saw, and the previous take on that phone (the causal parent).
_Avoid_: event, log line, transaction

**Fold (合併)**:
Replaying every movement for one item from its opening quantity. Parents come first; otherwise the earlier timestamp wins. A consume that does not fit is rejected and does not change the quantity. A later sync can reject a take that had already been applied.
_Avoid_: last write wins, conflict copy

**Purchase (採購)**:
One trip for the space: several goods and a single total. Checking it off adds each good's quantity to the shelf.
_Avoid_: cart, order, expense, per-item price

**Offline queue (離線佇列)**:
Takes and purchase edits a phone keeps until it can sync. Each new take of the same item points at the previous one still on that phone.

## Relationships

- A space has many members, items, movements, and purchases.
- An item's quantity is the fold of its movements from the opening quantity.
- A purchase holds many goods and one total. Checking it off restocks each good.
- Shelf rules live in `packages/domain/src/stock`. Purchase rules live in `packages/domain/src/purchase`. The phone queue lives in `packages/domain/src/offline`. Convex authorizes, reads, runs the rule, and writes.
