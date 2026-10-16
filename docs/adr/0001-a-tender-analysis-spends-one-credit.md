# A tender analysis spends one Credit

Uploading a Tender PDF spends one Credit before the file is stored or scored. The update itself requires `credits > 0`, so two analyses at once cannot drive the balance below zero. If storage or scoring fails, that Credit is returned. Charging after a successful score was rejected: a failure would still have done the work, and a concurrent pair could both pass a balance check that lived outside the write.
