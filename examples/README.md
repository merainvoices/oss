# Examples

Runnable scripts using the packages together. From the repository root:

```sh
npm install                      # links the packages; nothing is downloaded
node examples/full-invoice.mjs
```

| Script | What it shows |
| --- | --- |
| [`full-invoice.mjs`](full-invoice.mjs) | Check the buyer's GSTIN, number the invoice, add it up, write the total in words, build the UPI link |
| [`gstin-hindi.mjs`](gstin-hindi.mjs) | GSTIN checks with your own messages (Hindi), keyed by the error code |
| [`gstr2b-reconcile.mjs`](gstr2b-reconcile.mjs) | Match a GSTR-2B download against a purchase register |
| [`bank-statement.mjs`](bank-statement.mjs) | Read an HDFC-style statement, check the running balance, match it against your entries |

The sample data in [`data/`](data) is made up: the GSTINs pass the check digit but don't belong to anyone, and `shreeganesh@example` isn't a real UPI ID.

`npm test` runs every example and checks its output.
