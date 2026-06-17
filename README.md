# Business Manager

A self-hosted business app: dashboard, sales, expenses, dues, and a products
database with auto-generated barcodes. Runs on any PC with Node.js installed
— no internet connection needed once it's running, and no paid services.

## What you get

- **Dashboard** — sales/expenses/dues chart, true profit summary (accounts for product cost, not just sale price), stock alerts
- **Sales page** — add sales at the top (pick a product or enter a custom sale; quantity × unit price always calculates the total automatically), plus the full sales list, date filters, totals, delete
- **Expenses page** — add expenses at the top, plus the full expenses list, date filters, totals, delete
- **Dues page** — add a new due or record a due payment at the top, plus outstanding and paid due lists with totals
- **Products page** — add products with quantity, purchase price, sell price; every product gets an automatic barcode like `RIC-1001` (first letters of the name + a running number); barcodes render as real scannable Code128 barcodes, and the print label screen lets you adjust the name font size, price font size, and barcode width/height before printing, with an Exit button to back out at any time
- Selling a product automatically reduces its stock count, and profit is calculated as sale price minus that product's purchase cost (not the full sale amount)
- All data is stored in one file on your server PC (`data/business.json`) — works for one PC or is shared across every device on your network

## Requirements

Install Node.js (version 16 or newer) on the PC that will act as the server:
https://nodejs.org — download the "LTS" version and run the installer. No
other dependencies, accounts, or paid software needed.

## Running it

1. Unzip this folder anywhere, e.g. `Documents/business-manager`.
2. Start the server:
   - **Windows**: double-click `start.bat`
   - **Mac/Linux**: open Terminal in this folder and run `./start.sh` (or `node server.js`)
3. The terminal window will print something like:
   ```
   On this PC:        http://localhost:4000
   From other devices: http://192.168.1.42:4000
   ```
4. Open that `localhost` address in any browser on the same PC (Chrome, Edge, Firefox, Safari all work).
5. **Keep that terminal window open** — closing it stops the server. Minimize it instead.

## Using it from other devices (phones, other PCs, tablets)

Because this is a real server, every device on the same Wi-Fi/network can
connect to it and see the same shared data live:

1. Make sure the other device is on the **same Wi-Fi network** as the server PC.
2. On the other device's browser, type the "From other devices" address shown in the terminal, e.g. `http://192.168.1.42:4000`.
3. That's it — same dashboard, same products, same sales, shared in real time.

If it doesn't connect, your PC's firewall may be blocking incoming connections
on port 4000. On Windows, allow Node.js through the firewall when prompted,
or open port 4000 manually in Windows Defender Firewall settings.

## Running it permanently (optional)

If you want the server to always be running (so you don't have to start it
every morning), set up the PC it runs on to start it automatically:

- **Windows**: place a shortcut to `start.bat` in the Startup folder (`shell:startup` in the Run dialog).
- **Mac/Linux**: use `pm2` (`npm install -g pm2`, then `pm2 start server.js`) or a `cron @reboot` entry.

## Changing the port

If port 4000 is already used by something else, set a different one:

- **Windows**: edit `start.bat` and add `set PORT=5000` before the `node server.js` line.
- **Mac/Linux**: run `PORT=5000 node server.js` instead of `./start.sh`.

## Backing up your data

All your data lives in a single file: `data/business.json`. To back up,
just copy that file somewhere safe (USB drive, cloud folder, email it to
yourself). To restore, replace it back into the `data` folder while the
server is stopped.

## Printing barcode labels

On the Products page, click **Label** on any product card to open a
printable barcode preview, then click **Print label**. This opens your
browser's print dialog — works with regular printers or barcode label printers.

## Folder structure

```
business-manager/
  server.js          the server (no installation required, pure Node.js)
  package.json        project info only — no dependencies to install
  start.bat            double-click to start on Windows
  start.sh              run on Mac/Linux
  data/
    business.json        your data, created automatically on first run
  public/
    index.html             the app's pages
    style.css                responsive styling
    app.js                     app behavior, charts, barcode rendering
```

## Troubleshooting

**"node is not recognized" / "command not found"** — Node.js isn't installed
or wasn't added to your PATH. Reinstall from nodejs.org and restart your terminal.

**Page loads but looks broken / no charts** — you need an internet connection
the first time you load the page in each browser, since charts and barcode
icons load from a CDN. After that, your browser caches them.

**Other devices can't connect** — check that the server PC's firewall allows
incoming connections, and that all devices are on the same network (not on
guest Wi-Fi, which often isolates devices from each other).
