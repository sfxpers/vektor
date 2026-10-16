# The Catalog is the price list

The prices live only in `src/lib/billing-catalog.ts`, in ZAR cents. Starter is 39900 for 5 Credits a month, Pro is 129900 for 20, Scale is 249900 for 50, and a Single Analysis is 14900 for 1 Credit once. Pages read that list. Restating a price in a component was rejected because the two copies drift. Changing an amount or a Credit count waits for approval.
