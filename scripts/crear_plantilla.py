"""Genera public/plantilla-registros.xlsx: la plantilla para importar pilotos, cabezales y TC.

Uso:  python scripts/crear_plantilla.py
"""
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

SALIDA = Path(__file__).resolve().parent.parent / "public" / "plantilla-registros.xlsx"

COLUMNAS = [
    # (título, ancho, como texto)
    ("Piloto", 38, False),
    ("Licencia", 20, True),
    ("Teléfono", 14, True),
    ("Transporte", 30, False),
    ("Placa cabezal", 16, True),
    ("Placa TC", 14, True),
]
CASCO = "1F3440"
SENAL = "F2B705"
borde = Border(*(Side(style="thin", color="9AA5AB"),) * 4)

wb = Workbook()
ws = wb.active
ws.title = "Registros"
for i, (titulo, ancho, _) in enumerate(COLUMNAS, start=1):
    c = ws.cell(row=1, column=i, value=titulo)
    c.font = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
    c.fill = PatternFill("solid", fgColor=CASCO)
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.border = borde
    ws.column_dimensions[c.column_letter].width = ancho
ws.row_dimensions[1].height = 22
ws.freeze_panes = "A2"
# Licencia, teléfono y placas como texto: Excel no quita ceros ni los vuelve números.
for fila in range(2, 1001):
    for i, (_, _, texto) in enumerate(COLUMNAS, start=1):
        c = ws.cell(row=fila, column=i)
        c.border = borde
        if texto:
            c.number_format = "@"
ws.auto_filter.ref = "A1:F1000"

info = wb.create_sheet("Instrucciones")
info.column_dimensions["A"].width = 100
lineas = [
    ("Cómo llenar la plantilla", True),
    ("", False),
    ("1. Llena la hoja «Registros»: una fila por piloto con su cabezal y su TC. No cambies los títulos de la primera fila.", False),
    ("2. Piloto es obligatorio si llenas Licencia o Teléfono. Placa cabezal y Placa TC pueden ir solas (sin piloto).", False),
    ("3. Si un piloto ya existe en el sistema (misma licencia, o mismo nombre si no tiene licencia), no se duplica:", False),
    ("   se actualizan su teléfono y transporte con lo que pongas aquí.", False),
    ("4. Lo mismo con cabezales y TC: si la placa ya existe, solo se actualiza el transporte.", False),
    ("5. Los transportes que no estén en el catálogo se agregan solos.", False),
    ("6. Las fotos y PDF (licencias, tarjetas de circulación) se suben después en el sistema, en la ficha de cada uno.", False),
    ("", False),
    ("Ejemplo de filas (no las copies a «Registros» si no son reales):", True),
]
for i, (t, negrita) in enumerate(lineas, start=1):
    info.cell(row=i, column=1, value=t).font = Font(bold=negrita, size=13 if i == 1 else 11)
ejemplo = info.cell(row=len(lineas) + 1, column=1)
ejemplo.value = "JUAN PEREZ EJEMPLO | 0000 00000 0101 | 5555 0000 | TRANSPORTES EJEMPLO | 000 AAA | 00 AAA"
ejemplo.font = Font(italic=True, color="51606A")
info.cell(row=1, column=1).fill = PatternFill("solid", fgColor=SENAL)

wb.active = 0
wb.save(SALIDA)
print("Plantilla creada:", SALIDA)
