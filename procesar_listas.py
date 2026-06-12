import csv
import json
import glob
import os

def clean_money(val):
    val = val.replace('$', '').replace('.', '').replace(' ', '').strip()
    if val == '' or val.startswith('ISO') or val == '#N/D' or val == '-':
        return 0
    try:
        return float(val)
    except ValueError:
        return 0

def clean_percent(val):
    val = val.replace('%', '').strip()
    try:
        return float(val) / 100.0
    except ValueError:
        return 0.10  # default 10%

def process_files():
    db = []
    
    files = glob.glob('Lista de Precios*.csv')
    for file in files:
        # Extraer marca del nombre del archivo, ej: "Lista de Precios Peugeot Junio 2026.csv"
        marca = file.split(' ')[3]
        
        with open(file, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f, delimiter=';')
            for row in reader:
                if len(row) < 30:
                    continue
                
                name = row[0].strip()
                # Omitir cabeceras o filas vacías
                if not name or name.startswith(';') or 'VEH' in name or 'KEY' in name or name.startswith('Tope') or 'LISTA' in name:
                    continue
                
                # Check if it looks like a valid car row (has a price)
                precio_con_iva = clean_money(row[6])
                precio_sin_iva = clean_money(row[7])
                
                if precio_con_iva == 0 or precio_sin_iva == 0:
                    continue
                
                margen_red_str = row[31] if len(row) > 31 else '10%'
                margen_red = clean_percent(margen_red_str)
                # Pompeyo uses 10% typically, but we'll store the list margin as reference, though we will hardcode 10% in UI as requested.
                
                car_data = {
                    "id": f"{marca}-{name}".replace(' ', '-').lower(),
                    "marca": marca,
                    "modelo": name,
                    "precio_lista_sin_iva": precio_sin_iva,
                    "margen_compra_pct": 0.10, # As per user instructions "10%"
                    "medios_pago": {
                        "contado": {
                            "aporte_stellantis_con_iva": clean_money(row[11]),
                            "aporte_red_con_iva": clean_money(row[10]),
                            "aporte_fi_con_iva": 0
                        },
                        "credito_convencional": {
                            "aporte_stellantis_con_iva": clean_money(row[16]),
                            "aporte_red_con_iva": clean_money(row[15]),
                            "aporte_fi_con_iva": clean_money(row[17])
                        },
                        "compra_inteligente": {
                            "aporte_stellantis_con_iva": clean_money(row[22]),
                            "aporte_red_con_iva": clean_money(row[21]),
                            "aporte_fi_con_iva": clean_money(row[23])
                        }
                    }
                }
                db.append(car_data)
    
    with open('autos_db.json', 'w', encoding='utf-8') as f:
        json.dump(db, f, indent=4, ensure_ascii=False)

if __name__ == '__main__':
    process_files()
    print("Base de datos generada exitosamente en autos_db.json")
