import pdfplumber

with pdfplumber.open("/Users/ashwinram/kaasu_tracker/cams-statements/ashwinram232_no_pan_20260323_041341.pdf") as pdf:
    page = pdf.pages[0]
    for w in page.extract_words():
        print(f"x0={w['x0']:.1f}  top={w['top']:.1f}  {w['text']}")