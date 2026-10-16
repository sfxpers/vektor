# Vektor

South African tender compliance for contractors. A person signs up, sets up a Company, keeps its Compliance documents current, spends a Credit to analyse a Tender, and pays for Credits by EFT.

## Language

**Company**:
The contractor profile a signed-in person registers: its name, CIPC number, and the statutory fields the tender forms read. One person may hold more than one Company. Creating one grants five Credits, in the same write as the Company.
_Avoid_: Account, organisation, tenant, workspace

**Credit**:
The unit a Tender analysis spends. The balance cannot go below zero; the guard sits inside the update. A failed analysis returns the Credit it spent.
_Avoid_: Token, seat, licence

**Tender**:
The tender PDF a Company uploads to be scored against its Compliance documents.
_Avoid_: Bid, opportunity, RFP

**Analysis**:
One scoring of a Tender. It spends one Credit.
_Avoid_: Scan, audit, report as the unit

**Verdict**:
The band of an analysis score. 75 and above is GO, 50 and above is CAUTION, below 50 is NO-GO. A missing score is UNKNOWN.
_Avoid_: Pass, fail, recommendation as the stored word

**Compliance document**:
A file the Company keeps current: a tax pin, COIDA, B-BBEE, a bargaining-council certificate, or a director's identity document. Reminders go out at 30 days, 7 days, and on the day it expires.
_Avoid_: Certificate as the umbrella, attachment

**EFT**:
The only way to buy Credits. The buyer pays the Catalog price into the business bank account and uploads proof. Credits land when an Admin confirms the payment, and not when the proof is uploaded.
_Avoid_: Stripe, card, checkout, wallet

**Catalog**:
The four prices in `src/lib/billing-catalog.ts`. Starter, Pro, and Scale are monthly Credit allowances. Single Analysis is one Credit, once. Amounts are cents in ZAR. The page reads the Catalog; it does not restate the prices.
_Avoid_: Price list in the page, plan copy hardcoded beside the catalog

**Admin**:
Staff who confirm or reject an EFT and who can see every Company. Confirming is the act that grants paid Credits.
_Avoid_: Moderator, support, owner

**Referral**:
An invite. The referrer earns Credits when an Admin confirms the invited person's first paid subscription EFT. The invited person earns none. A person can be referred once, cannot refer themselves, and a referrer is capped at 5 rewards in a UTC month and 20 in total.
_Avoid_: Affiliate, bounty, signup bonus
