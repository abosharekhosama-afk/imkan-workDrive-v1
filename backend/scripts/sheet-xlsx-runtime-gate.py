from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / 'test' / 'fixtures' / 'sheet-roundtrip-fixture.xlsx'
NS = {
    'm':'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'pr':'http://schemas.openxmlformats.org/package/2006/relationships',
}

def esc(v):
    return str(v).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')

workbook = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/></sheets>
<definedNames><definedName name="SalesData">Data!$A$1:$C$4</definedName></definedNames></workbook>'''

sheet = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" state="frozen"/></sheetView></sheetViews>
<sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Product</t></is></c><c r="B1" t="inlineStr"><is><t>Qty</t></is></c><c r="C1" t="inlineStr"><is><t>Total</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Alpha</t></is></c><c r="B2"><v>2</v></c><c r="C2"><f>B2*10</f><v>20</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Beta</t></is></c><c r="B3"><v>3</v></c><c r="C3"><f>B3*10</f><v>30</v></c></row>
<row r="4"><c r="A4" t="inlineStr"><is><t>Gamma</t></is></c><c r="B4"><v>4</v></c><c r="C4"><f>B4*10</f><v>40</v></c></row>
</sheetData>
<mergeCells count="1"><mergeCell ref="A1:A1"/></mergeCells>
<dataValidations count="1"><dataValidation type="whole" operator="between" sqref="B2:B4"><formula1>1</formula1><formula2>100</formula2></dataValidation></dataValidations>
<conditionalFormatting sqref="C2:C4"><cfRule type="cellIs" operator="greaterThan"><formula>25</formula></cfRule></conditionalFormatting>
<tableParts count="1"><tablePart r:id="rIdTable1_1"/></tableParts>
<drawing r:id="rIdDrawing1"/>
</worksheet>'''

sheet2 = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Summary</t></is></c></row></sheetData></worksheet>'''

rels_root = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'
sheet_rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdTable1_1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/><Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>'
wb_rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'
table = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="SalesTable" displayName="SalesTable" ref="A1:C4" headerRowCount="1" totalsRowCount="0"><autoFilter ref="A1:C4"/><tableColumns count="3"><tableColumn id="1" name="Product"/><tableColumn id="2" name="Qty"/><tableColumn id="3" name="Total"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>'''
drawing = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>4</xdr:col><xdr:row>1</xdr:row></xdr:from><xdr:to><xdr:col>9</xdr:col><xdr:row>15</xdr:row></xdr:to><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>'''
ct = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>'''
with ZipFile(FIX, 'w', ZIP_DEFLATED) as z:
    for p, data in {'[Content_Types].xml':ct,'_rels/.rels':rels_root,'xl/workbook.xml':workbook,'xl/_rels/workbook.xml.rels':wb_rels,'xl/worksheets/sheet1.xml':sheet,'xl/worksheets/sheet2.xml':sheet2,'xl/worksheets/_rels/sheet1.xml.rels':sheet_rels,'xl/tables/table1.xml':table,'xl/drawings/drawing1.xml':drawing}.items(): z.writestr(p,data)

with ZipFile(FIX) as z:
    names=set(z.namelist())
    assert 'xl/workbook.xml' in names and 'xl/worksheets/sheet1.xml' in names
    sx=z.read('xl/worksheets/sheet1.xml').decode()
    sr=z.read('xl/worksheets/_rels/sheet1.xml.rels').decode()
    tx=z.read('xl/tables/table1.xml').decode()
    assert 'rIdTable1_1' in sx and 'rIdDrawing1' in sx
    assert 'relationships/table' in sr and 'relationships/drawing' in sr
    assert 'SalesTable' in tx and 'A1:C4' in tx
    assert '<f>B2*10</f>' in sx and '<dataValidation' in sx and '<conditionalFormatting' in sx
    wx=z.read('xl/workbook.xml').decode()
    assert 'SalesData' in wx
print(f'PASS: runtime XLSX fixture gate -> {FIX}')
