from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

out = r"c:\Users\MOHIT\Desktop\Finance auditor\server\uploads\sample_expense_policy.pdf"
c = canvas.Canvas(out, pagesize=letter)
w, h = letter
y = h - 50

def heading(text):
    global y
    if y < 60:
        c.showPage()
        y = h - 50
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, text)
    y -= 22

def subheading(text):
    global y
    if y < 60:
        c.showPage()
        y = h - 50
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, y, text)
    y -= 16

def body(text):
    global y
    if y < 60:
        c.showPage()
        y = h - 50
    c.setFont("Helvetica", 9)
    c.drawString(60, y, text)
    y -= 14

def gap():
    global y
    y -= 8

c.setFont("Helvetica-Bold", 18)
c.drawString(50, y, "AcmeCorp Travel and Expense Policy")
y -= 20
c.setFont("Helvetica", 10)
c.drawString(50, y, "Effective January 1, 2026 | Version 3.1")
y -= 30

heading("1. MEALS AND ENTERTAINMENT")
body("1.1 Daily meal reimbursement limits per person:")
body("    Breakfast: up to 20 USD")
body("    Lunch: up to 35 USD")
body("    Dinner: up to 60 USD")
body("    In NYC, SF, London: add 25 percent premium to all limits")
body("1.2 Client entertainment pre-approval required for amounts over 150 USD")
body("1.3 Alcohol is NOT reimbursable except at client entertainment events")
body("1.4 Receipts REQUIRED for all meal claims above 25 USD")
body("1.5 Tips may not exceed 20 percent of the pre-tax meal amount")
gap()

heading("2. TRANSPORTATION")
body("2.1 Economy class airfare is standard for all domestic flights")
body("2.2 Business class permitted only for flights over 6 hours")
body("2.3 Ride-sharing (Uber, Lyft) preferred over taxis")
body("2.4 Max daily parking: 40 USD standard, 60 USD city centers")
body("2.5 Mileage reimbursement: 0.67 USD per mile (IRS rate)")
body("2.6 First-class travel PROHIBITED except VP-level executives")
gap()

heading("3. LODGING")
body("3.1 Standard nightly hotel rate limits:")
body("    Tier 1 (NYC, SF, London, Tokyo): up to 300 USD/night")
body("    Tier 2 (Chicago, Austin, Berlin): up to 200 USD/night")
body("    All other locations: up to 150 USD/night")
body("3.2 Extended stays (5+ nights) must use corporate-rate hotels")
body("3.3 Room upgrades and minibar charges are NOT reimbursable")
body("3.4 Laundry reimbursable only for trips over 4 nights")
gap()

heading("4. OFFICE SUPPLIES")
body("4.1 Purchases up to 75 USD need no pre-approval")
body("4.2 Equipment above 200 USD requires IT department approval")
body("4.3 Software subscriptions go through IT procurement")
gap()

heading("5. GENERAL RULES")
body("5.1 Claims must be submitted within 30 days of expense date")
body("5.2 Claims older than 60 days AUTOMATICALLY REJECTED")
body("5.3 Original receipts required for all claims above 25 USD")
body("5.4 Duplicate receipt submission grounds for disciplinary action")
body("5.5 Personal expenses may NEVER be included in business claims")
body("5.6 Currency conversion at exchange rate on the expense date")
body("5.7 Compliance below 70 percent triggers enhanced review")
gap()

heading("6. PROHIBITED EXPENSES")
body("6.1 NEVER reimbursable:")
body("    Personal grooming or spa services")
body("    Traffic and parking fines")
body("    Political or charitable donations")
body("    Gifts exceeding 50 USD in value")
body("    Gambling or adult entertainment")
body("    Personal travel extensions on business trips")

c.save()
print("OK - Policy PDF created at: " + out)
