# Live symbol_search sample (orchestrator, 2026-11-25)
`GET /symbol_search?symbol=AAPL&outputsize=3` → status "ok", 1 credit (daily_usage went 5 → 6).
First item fields: symbol, instrument_name, exchange ("NASDAQ"), mic_code ("XNGS"), exchange_timezone ("America/New_York"),
instrument_type ("Common Stock"), country ("United States"), currency ("USD").
Other items: BCBA/XBUE country "Argentina" (Depositary Receipt, ARS); BMV/XMEX country "Mexico" (Common Stock, MXN).
