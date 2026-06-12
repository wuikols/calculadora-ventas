const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function cleanMoney(val) {
    if (!val) return 0;
    val = String(val).replace(/\$/g, '').replace(/\./g, '').replace(/ /g, '').trim();
    if (val === '' || val.startsWith('ISO') || val === '#N/D' || val === '-' || val === 'N/A') return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}

function normalize(s) {
    return String(s).toUpperCase().replace(/ /g, '').trim();
}

function processFiles() {
    const db = [];
    const allFiles = fs.readdirSync(__dirname);
    const b2bFile = allFiles.find(f => f.includes('Descuentos B2B') && f.endsWith('.xlsx') && !f.includes('~'));
    const files = allFiles.filter(f => f.startsWith('Lista de Precios') && f.endsWith('.xlsx') && !f.includes('~'));

    const b2bData = {};
    if (b2bFile) {
        const wbB2B = XLSX.readFile(path.join(__dirname, b2bFile));
        wbB2B.SheetNames.forEach(sheetName => {
            const data = XLSX.utils.sheet_to_json(wbB2B.Sheets[sheetName], {header: 1});
            for(let i=0; i<data.length; i++){
                const row = data[i];
                if(row && (row[0] || row[2]) && i+2 < data.length) {
                    const carName = String(row[0] || row[2]).trim();
                    if(carName.length > 5 && carName !== 'Versión ' && !carName.includes('ACCIONES') && !carName.includes('TABLA')) {
                        const rowStellantis = data[i+1] || [];
                        const rowRed = data[i+2] || [];
                        if(String(rowStellantis[4] || '').includes('Stellantis') && String(rowRed[4] || '').includes('RED')) {
                            const normName = normalize(carName);
                            b2bData[normName] = {
                                stellantis: {
                                    prof_t1: parseFloat(rowStellantis[5])||0,
                                    prof_t2: parseFloat(rowStellantis[6])||0,
                                    noprof_t1: parseFloat(rowStellantis[7])||0,
                                    noprof_t2: parseFloat(rowStellantis[8])||0,
                                    gc: parseFloat(rowStellantis[10])||0
                                },
                                red: {
                                    prof_t1: parseFloat(rowRed[5])||0,
                                    prof_t2: parseFloat(rowRed[6])||0,
                                    noprof_t1: parseFloat(rowRed[7])||0,
                                    noprof_t2: parseFloat(rowRed[8])||0,
                                    gc: parseFloat(rowRed[10])||0
                                }
                            };
                        }
                    }
                }
            }
        });
    }

    files.forEach(file => {
        const marca = file.split(' ')[3];
        const workbook = XLSX.readFile(path.join(__dirname, file));
        
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const lines = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

            const isComerciales = sheetName.toUpperCase().includes('COMERCIALES');

            lines.forEach(row => {
                if (!row || row.length < 25) return;

                const name = String(row[0] || '').trim();
                const nameCol2 = String(row[2] || '').trim();
                
                if (!name || name.startsWith(';') || name.includes('VEH') || name.includes('KEY') || name.startsWith('Tope') || name.includes('LISTA')) {
                    return;
                }

                const precioConIva = cleanMoney(row[6]);
                const precioSinIva = cleanMoney(row[7]);

                if (precioConIva === 0 || precioSinIva === 0) return;

                let indices = {
                    tmp_red: 10, tmp_stellantis: 11,
                    cc_red: 15, cc_stellantis: 16, cc_fi: 17,
                    ci_red: 21, ci_stellantis: 22, ci_fi: 23
                };

                if (isComerciales) {
                    indices = {
                        tmp_red: 11, tmp_stellantis: 12,
                        cc_red: 18, cc_stellantis: 19, cc_fi: 20,
                        ci_red: 26, ci_stellantis: 27, ci_fi: 28
                    };
                }

                // Si es Comerciales, los aportes ya vienen SIN IVA (Netos). Si es Pasajeros, vienen CON IVA y hay que dividirlos por 1.19
                const factor = isComerciales ? 1.0 : 1.19;

                const carData = {
                    id: `${marca}-${name}`.replace(/ /g, '-').toLowerCase() + `-${sheetName.toLowerCase()}`,
                    marca: marca,
                    modelo: `${nameCol2 || name} (${sheetName})`,
                    precio_lista_sin_iva: precioSinIva,
                    margen_compra_pct: 0.10,
                    b2b: b2bData[normalize(name)] || null,
                    medios_pago: {
                        contado: {
                            aporte_stellantis_neto: cleanMoney(row[indices.tmp_stellantis]) / factor,
                            aporte_red_neto: cleanMoney(row[indices.tmp_red]) / factor,
                            aporte_fi_neto: 0
                        },
                        credito_convencional: {
                            aporte_stellantis_neto: cleanMoney(row[indices.cc_stellantis]) / factor,
                            aporte_red_neto: cleanMoney(row[indices.cc_red]) / factor,
                            aporte_fi_neto: cleanMoney(row[indices.cc_fi]) / factor
                        },
                        compra_inteligente: {
                            aporte_stellantis_neto: cleanMoney(row[indices.ci_stellantis]) / factor,
                            aporte_red_neto: cleanMoney(row[indices.ci_red]) / factor,
                            aporte_fi_neto: cleanMoney(row[indices.ci_fi]) / factor
                        }
                    }
                };
                db.push(carData);
            });
        });
    });

    fs.writeFileSync(path.join(__dirname, 'autos_db.json'), JSON.stringify(db, null, 4), 'utf-8');
    const jsContent = "const autos_db = " + JSON.stringify(db, null, 4) + ";";
    fs.writeFileSync(path.join(__dirname, 'autos_db.js'), jsContent, 'utf-8');
    console.log(`Base de datos generada exitosamente con ${db.length} vehículos en total.`);
}

processFiles();
