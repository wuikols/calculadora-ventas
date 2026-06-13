const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function cleanString(s) {
    if (!s) return '';
    return String(s).toUpperCase()
        .replace(/FAMIILIAL/g, '')
        .replace(/FAMILIA/g, '')
        .replace(/NUEVO/g, '')
        .replace(/NEW/g, '')
        .replace(/MCA/g, '')
        .replace(/[\/\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalize(s) {
    return cleanString(s).replace(/\s/g, '');
}

function cleanMoney(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') {
        return Math.round(val);
    }
    let str = String(val).replace(/\$/g, '').replace(/ /g, '').trim();
    if (str === '' || str.startsWith('ISO') || str === '#N/D' || str === '-' || str === 'N/A') return 0;
    
    // Check if it has both dot and comma (e.g. 10.831.932,77)
    if (str.includes('.') && str.includes(',')) {
        str = str.replace(/\./g, '').replace(/,/g, '.');
    } else if (str.includes(',')) {
        // E.g. 10831932,77 -> replace comma with dot
        str = str.replace(/,/g, '.');
    } else if (str.includes('.') && str.split('.').length > 2) {
        // E.g. 10.831.932
        str = str.replace(/\./g, '');
    }
    
    const num = parseFloat(str);
    return isNaN(num) ? 0 : Math.round(num);
}

function findColumnIndices(lines) {
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const row = lines[i];
        if (row && row.some(c => c && (String(c).toUpperCase().includes('TODO MEDIO DE PAGO') || String(c).toUpperCase().includes('PRECIO LISTA')))) {
            headerRowIndex = i;
            break;
        }
    }
    
    if (headerRowIndex === -1) return null;
    
    const headerRow = lines[headerRowIndex];
    const subHeaderRow = lines[headerRowIndex + 1] || [];
    
    // Find section offsets
    let idxTmp = -1;
    let idxCc = -1;
    let idxCi = -1;
    
    for (let j = 0; j < headerRow.length; j++) {
        const val = String(headerRow[j] || '').toUpperCase();
        if (val.includes('TODO MEDIO DE PAGO') || val.includes('TODO MEDIO')) {
            idxTmp = j;
        } else if (val.includes('CONVENCIONAL') || val.includes('CREDITO CONVENCIONAL')) {
            idxCc = j;
        } else if (val.includes('INTELIGENTE') || val.includes('COMPRA INTELIGENTE')) {
            idxCi = j;
        }
    }
    
    const isComerciales = lines.some(row => row && row.some(c => c && String(c).toUpperCase().includes('VEHÍCULOS COMERCIALES')));
    
    // Default indices fallback
    const indices = {
        headerRowIndex: headerRowIndex,
        con_iva: 6,
        sin_iva: 7,
        tmp_red: isComerciales ? 11 : 10,
        tmp_stellantis: isComerciales ? 12 : 11,
        cc_red: isComerciales ? 18 : 15,
        cc_stellantis: isComerciales ? 19 : 16,
        cc_fi: isComerciales ? 20 : 17,
        ci_red: isComerciales ? 26 : 21,
        ci_stellantis: isComerciales ? 27 : 22,
        ci_fi: isComerciales ? 28 : 23
    };
    
    // Find con_iva / sin_iva in the subHeaderRow
    for (let j = 5; j <= 9; j++) {
        const val = String(subHeaderRow[j] || '').toUpperCase();
        if (val.includes('CON IVA')) indices.con_iva = j;
        else if (val.includes('SIN IVA')) indices.sin_iva = j;
    }
    
    // Helper to scan for header keywords within a section
    const findSubHeader = (startIdx, endIdx, keywords) => {
        for (let j = startIdx; j < endIdx; j++) {
            const val = String(subHeaderRow[j] || '').toUpperCase();
            if (keywords.some(kw => val.includes(kw))) {
                return j;
            }
        }
        return -1;
    };
    
    // Map dynamically based on headers
    if (idxTmp !== -1) {
        const end = idxCc !== -1 ? idxCc : (idxTmp + 7);
        const r = findSubHeader(idxTmp, end, ['APORTE RED', 'APORTE CE', 'APORTE CONCESIONARIO']);
        if (r !== -1) indices.tmp_red = r;
        const s = findSubHeader(idxTmp, end, ['APORTE STELLANTIS', 'STELLANTIS']);
        if (s !== -1) indices.tmp_stellantis = s;
    }
    
    if (idxCc !== -1) {
        const end = idxCi !== -1 ? idxCi : (idxCc + 7);
        const r = findSubHeader(idxCc, end, ['APORTE RED', 'APORTE CE', 'APORTE CONCESIONARIO']);
        if (r !== -1) indices.cc_red = r;
        const s = findSubHeader(idxCc, end, ['APORTE STELLANTIS', 'STELLANTIS']);
        if (s !== -1) indices.cc_stellantis = s;
        const f = findSubHeader(idxCc, end, ['APORTE FINANCIERA', 'FINANCIERA']);
        if (f !== -1) indices.cc_fi = f;
    }
    
    if (idxCi !== -1) {
        const end = idxCi + 8;
        const r = findSubHeader(idxCi, end, ['APORTE RED', 'APORTE CE', 'APORTE CONCESIONARIO']);
        if (r !== -1) indices.ci_red = r;
        const s = findSubHeader(idxCi, end, ['APORTE STELLANTIS', 'STELLANTIS']);
        if (s !== -1) indices.ci_stellantis = s;
        const f = findSubHeader(idxCi, end, ['APORTE FINANCIERA', 'FINANCIERA']);
        if (f !== -1) indices.ci_fi = f;
    }
    
    return indices;
}

function processFiles() {
    const db = [];
    const allFiles = fs.readdirSync(__dirname);
    const b2bFile = allFiles.find(f => f.includes('Descuentos B2B') && f.endsWith('.xlsx') && !f.includes('~'));
    const files = allFiles.filter(f => f.startsWith('Lista de Precios') && f.endsWith('.xlsx') && !f.includes('~'));

    const b2bEntries = [];
    if (b2bFile) {
        const wbB2B = XLSX.readFile(path.join(__dirname, b2bFile));
        wbB2B.SheetNames.forEach(sheetName => {
            const brand = sheetName.toUpperCase().trim();
            const data = XLSX.utils.sheet_to_json(wbB2B.Sheets[sheetName], {header: 1});
            for(let i=0; i<data.length; i++){
                const row = data[i];
                if(row && (row[0] || row[2]) && i+2 < data.length) {
                    const carName = String(row[0] || row[2]).trim();
                    if(carName.length > 5 && carName !== 'Versión ' && !carName.includes('ACCIONES') && !carName.includes('TABLA')) {
                        const rowStellantis = data[i+1] || [];
                        const rowRed = data[i+2] || [];
                        if(String(rowStellantis[4] || '').includes('Stellantis') && String(rowRed[4] || '').includes('RED')) {
                            b2bEntries.push({
                                originalName: carName,
                                familyName: row[2] ? String(row[2]).trim() : '',
                                brand: brand,
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
                            });
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

            const indices = findColumnIndices(lines);
            if (!indices) return;

            lines.forEach((row, rowIndex) => {
                if (rowIndex <= indices.headerRowIndex + 1) return;
                if (!row || row.length < 25) return;

                const name = String(row[0] || '').trim();
                const nameCol2 = String(row[2] || '').trim();
                
                const nameUpper = name.toUpperCase();
                if (!name || name.startsWith(';') || name.includes('VEH') || name.includes('KEY') || name.startsWith('Tope') || name.includes('LISTA') ||
                    nameUpper.includes('CÓDIGO') || nameUpper.includes('COD') || nameUpper.includes('REF') || nameUpper.includes('EDS')) {
                    return;
                }

                const precioConIva = cleanMoney(row[indices.con_iva]);
                const precioSinIva = cleanMoney(row[indices.sin_iva]);

                if (precioConIva === 0 || precioSinIva === 0) return;

                const factor = isComerciales ? 1.0 : 1.19;

                const cleanCar = cleanString(name);
                const candidates = b2bEntries.filter(b => b.brand === marca.toUpperCase());
                
                let b2bMatch = candidates.find(b => normalize(b.originalName) === normalize(name));
                
                if (!b2bMatch) {
                    b2bMatch = candidates.find(b => {
                        if (!b.familyName) return false;
                        const cleanFam = cleanString(b.familyName);
                        const familyParts = cleanFam.split(' ').filter(x => x.length > 0);
                        return familyParts.some(part => {
                            if (part === 'C3' && cleanCar.includes('C3 AIRCROSS')) return false;
                            if (part.length <= 1) return false;
                            return cleanCar.includes(part);
                        });
                    });
                }

                if (!b2bMatch) {
                    b2bMatch = candidates.find(b => {
                        const cleanB = cleanString(b.originalName);
                        return cleanCar.includes(cleanB) || cleanB.includes(cleanCar);
                    });
                }

                const b2b = b2bMatch ? {
                    stellantis: b2bMatch.stellantis,
                    red: b2bMatch.red
                } : null;

                const carData = {
                    id: `${marca}-${name}`.replace(/ /g, '-').toLowerCase() + `-${sheetName.toLowerCase()}`,
                    marca: marca,
                    modelo: `${nameCol2 || name} (${sheetName})`,
                    precio_lista_sin_iva: precioSinIva,
                    margen_compra_pct: 0.10,
                    b2b: b2b,
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
