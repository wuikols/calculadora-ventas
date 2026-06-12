
        const formatMoney = (amount) => {
            return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
        };

        const formatPercent = (val) => {
            return parseFloat(val).toFixed(2) + '%';
        };

        const parseMoney = (str) => {
            if (!str) return 0;
            const clean = str.toString().replace(/\./g, '').replace(/[^0-9]/g, '');
            return parseInt(clean, 10) || 0;
        };

        const applyMask = (input) => {
            let val = parseMoney(input.value);
            if (val === 0 && input.value === '') {
                input.value = '';
                return;
            }
            input.value = new Intl.NumberFormat('es-CL').format(val);
        };

        const state = {
            tipoVenta: 'retail',
            tipoConcesionario: 'prof',
            tramoB2b: 't1',
            excepcionTopes: false,
            marca: null,
            modelo: null,
            medioPago: 'contado',
            bonoRedVal: 0, // This variable will exclusively store NETO
            aporteStellantisVal: 0, // NETO
            aporteFiVal: 0, // NETO
            accesoriosVal: 0, // NETO
            umbralRojo: 3,
            umbralVerde: 6
        };

        const updateLabels = () => {
            document.getElementById('b2bSelectors').style.display = state.tipoVenta === 'retail' ? 'none' : 'flex';
        };

        const tabRetail = document.getElementById('tabRetail');
        const tabComercial = document.getElementById('tabComercial');
        const selectTipoConcesionario = document.getElementById('tipoConcesionario');
        const selectTramoB2b = document.getElementById('tramoB2b');
        const selectMarca = document.getElementById('marca');
        const selectModelo = document.getElementById('modelo');
        const selectMedioPago = document.getElementById('medioPago');
        const chkExcepcion = document.getElementById('chkExcepcion');

        const inputBonoRedNeto = document.getElementById('bonoRedNeto');
        const inputBonoRedBruto = document.getElementById('bonoRedBruto');
        const inputBonoRedPct = document.getElementById('bonoRedPct');

        const inputAporteStellantisNeto = document.getElementById('aporteStellantisNeto');
        const inputAporteStellantisBruto = document.getElementById('aporteStellantisBruto');
        const inputAporteStellantisPct = document.getElementById('aporteStellantisPct');

        const inputAporteFiNeto = document.getElementById('aporteFiNeto');
        const inputAporteFiBruto = document.getElementById('aporteFiBruto');

        const inputAccesoriosNeto = document.getElementById('accesoriosNeto');
        const inputAccesoriosBruto = document.getElementById('accesoriosBruto');

        const comparativaBox = document.getElementById('comparativaBox');

        // Populate Marcas
        const marcas = [...new Set(autos_db.map(a => a.marca))].sort();
        marcas.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            selectMarca.appendChild(opt);
        });

        const getTopes = (car) => {
            if (state.tipoVenta === 'retail') {
                return { red: 2.5 };
            } else {
                const b2bKey = `${state.tipoConcesionario}_${state.tramoB2b}`;
                const redTope = (car.b2b && car.b2b.red && car.b2b.red[b2bKey]) ? car.b2b.red[b2bKey] : 0;
                return { red: redTope * 100 }; // Ensure it's in percentage 0-100 scale
            }
        };

        const calculateSimulation = (car, typeVenta, tramo) => {
            // Simulador interno para caja comparativa
            const precioListaNeto = car.precio_lista_sin_iva;
            const pagoData = car.medios_pago[state.medioPago] || car.medios_pago['contado'];

            let aporteStellantisNeto = 0;
            let bonoRedNeto = 0;

            if (typeVenta === 'retail') {
                aporteStellantisNeto = pagoData.aporte_stellantis_neto || 0;
                bonoRedNeto = precioListaNeto * 0.025; // max 2.5%
            } else {
                const listStellantis = pagoData.aporte_stellantis_neto || 0;
                const b2bStellantis = (car.b2b && car.b2b.stellantis && car.b2b.stellantis[tramo]) ? (precioListaNeto * car.b2b.stellantis[tramo]) : 0;
                aporteStellantisNeto = Math.max(listStellantis, b2bStellantis);

                const b2bKey = `${state.tipoConcesionario}_${tramo}`;
                const b2bRedTope = (car.b2b && car.b2b.red && car.b2b.red[b2bKey]) ? car.b2b.red[b2bKey] : 0;
                bonoRedNeto = precioListaNeto * b2bRedTope;
            }

            const aporteFiNeto = pagoData.aporte_fi_neto || 0;
            
            const margenCompraPct = car.margen_compra_pct || 0.10;
            const margenCompraNeto = precioListaNeto * margenCompraPct;
            const utilidadNeto = margenCompraNeto - bonoRedNeto; // Accesorios 0 en simulación
            const utilidadPct = (utilidadNeto / precioListaNeto) * 100;

            const descuentoTotalNeto = bonoRedNeto + aporteStellantisNeto + aporteFiNeto;
            const precioVentaNeto = precioListaNeto - descuentoTotalNeto;
            const precioVentaBruto = precioVentaNeto * 1.19;

            return {
                type: typeVenta,
                precioBruto: precioVentaBruto,
                utilidadPct: utilidadPct
            };
        };

        const updateComparativa = () => {
            if (!state.modelo) {
                comparativaBox.classList.remove('active');
                return;
            }
            const car = autos_db.find(a => a.id === state.modelo);
            const simRetail = calculateSimulation(car, 'retail', state.tramoB2b);
            const simComercial = calculateSimulation(car, 'comercial', state.tramoB2b);

            let best = null;
            const valid = [];
            if (simRetail.utilidadPct >= 3) valid.push(simRetail);
            if (simComercial.utilidadPct >= 3) valid.push(simComercial);

            if (valid.length > 0) {
                best = valid.reduce((prev, curr) => (curr.precioBruto < prev.precioBruto) ? curr : prev);
            }

            if (best) {
                const typeName = best.type === 'retail' ? 'Venta Retail' : 'Venta Comercial';
                comparativaBox.innerHTML = `<strong>Simulación Óptima:</strong> Con este modelo y medio de pago, la mejor opción es <strong>${typeName}</strong>, entregando un precio cliente de <strong>${formatMoney(best.precioBruto)}</strong> y manteniendo un <strong>${formatPercent(best.utilidadPct)}</strong> de margen.`;
                comparativaBox.classList.add('active');
            } else {
                comparativaBox.classList.remove('active');
            }
        };

        const renderTripleInputs = () => {
            if (!state.modelo) return;
            const car = autos_db.find(a => a.id === state.modelo);
            const pNeto = car.precio_lista_sin_iva;

            // Bono Red
            inputBonoRedNeto.value = new Intl.NumberFormat('es-CL').format(Math.round(state.bonoRedVal));
            inputBonoRedBruto.value = new Intl.NumberFormat('es-CL').format(Math.round(state.bonoRedVal * 1.19));
            if(inputBonoRedPct) inputBonoRedPct.value = ((state.bonoRedVal / pNeto) * 100).toFixed(2);

            // Stellantis
            inputAporteStellantisNeto.value = new Intl.NumberFormat('es-CL').format(Math.round(state.aporteStellantisVal));
            inputAporteStellantisBruto.value = new Intl.NumberFormat('es-CL').format(Math.round(state.aporteStellantisVal * 1.19));
            if(inputAporteStellantisPct) inputAporteStellantisPct.value = ((state.aporteStellantisVal / pNeto) * 100).toFixed(2);

            // Fi
            inputAporteFiNeto.value = new Intl.NumberFormat('es-CL').format(Math.round(state.aporteFiVal));
            inputAporteFiBruto.value = new Intl.NumberFormat('es-CL').format(Math.round(state.aporteFiVal * 1.19));

            // Accesorios
            inputAccesoriosNeto.value = new Intl.NumberFormat('es-CL').format(Math.round(state.accesoriosVal));
            inputAccesoriosBruto.value = new Intl.NumberFormat('es-CL').format(Math.round(state.accesoriosVal * 1.19));
        };

        const calculate = () => {
            if (!state.modelo) return;

            const car = autos_db.find(a => a.id === state.modelo);

            // 1. Base Prices
            const precioListaNeto = car.precio_lista_sin_iva;

            // 2. Validate Topes for Bono Red
            const topes = getTopes(car);
            let userBonoRedNeto = state.bonoRedVal;
            let currentBonoRedPct = (userBonoRedNeto / precioListaNeto) * 100;
            
            if (currentBonoRedPct > topes.red && !state.excepcionTopes) {
                currentBonoRedPct = topes.red;
                userBonoRedNeto = precioListaNeto * (currentBonoRedPct / 100);
                state.bonoRedVal = userBonoRedNeto;
                renderTripleInputs();
            }

            // 3. Aportes (From Inputs -> Netos)
            const aporteStellantisNeto = state.aporteStellantisVal;
            const aporteFiNeto = state.aporteFiVal;
            const bonoRedNeto = userBonoRedNeto;
            const accesoriosNeto = state.accesoriosVal;

            // 4. Margins
            const margenCompraPct = car.margen_compra_pct || 0.10;
            const margenCompraNeto = precioListaNeto * margenCompraPct;

            // 5. Costo
            const costoVehiculo = precioListaNeto - margenCompraNeto - aporteStellantisNeto - aporteFiNeto;

            // 6. Utilidad
            const utilidadNeto = margenCompraNeto - bonoRedNeto - accesoriosNeto;
            const utilidadPct = (utilidadNeto / precioListaNeto) * 100;

            // 7. Venta y Descuento Total
            const descuentoTotalNeto = bonoRedNeto + aporteStellantisNeto + aporteFiNeto;
            const precioVentaNeto = precioListaNeto - descuentoTotalNeto;
            const precioVentaBruto = precioVentaNeto * 1.19;

            // Update DOM
            document.getElementById('resPrecioLista').textContent = formatMoney(precioListaNeto);
            document.getElementById('resAporteStellantis').textContent = '-' + formatMoney(aporteStellantisNeto);
            document.getElementById('resAporteFi').textContent = '-' + formatMoney(aporteFiNeto);
            document.getElementById('resBonoRed').textContent = '-' + formatMoney(bonoRedNeto);
            document.getElementById('resDescuentoTotal').textContent = '-' + formatMoney(descuentoTotalNeto);
            document.getElementById('resCosto').textContent = formatMoney(costoVehiculo);
            
            document.getElementById('resMargenTotal').textContent = formatMoney(margenCompraNeto);
            
            const resUtilidad = document.getElementById('resUtilidad');
            resUtilidad.textContent = `${formatMoney(utilidadNeto)} (${formatPercent(utilidadPct)})`;
            
            // Semáforo visual
            resUtilidad.classList.remove('semaforo-red', 'semaforo-yellow', 'semaforo-green');
            if (utilidadPct < state.umbralRojo) {
                resUtilidad.classList.add('semaforo-red');
            } else if (utilidadPct >= state.umbralRojo && utilidadPct < state.umbralVerde) {
                resUtilidad.classList.add('semaforo-yellow');
            } else {
                resUtilidad.classList.add('semaforo-green');
            }

            document.getElementById('resFinalNeto').textContent = `Neto: ${formatMoney(precioVentaNeto)}`;
            document.getElementById('resFinalBruto').textContent = formatMoney(precioVentaBruto);

            updateComparativa();
        };

        const loadDefaults = () => {
            const car = autos_db.find(a => a.id === state.modelo);
            if (!car) return;
            const pagoData = car.medios_pago[state.medioPago] || car.medios_pago['contado'];

            // Aporte Stellantis
            let defaultStellantisNeto = pagoData.aporte_stellantis_neto || 0;
            if (state.tipoVenta === 'comercial') {
                const b2bStellantis = (car.b2b && car.b2b.stellantis && car.b2b.stellantis[state.tramoB2b]) ? (car.precio_lista_sin_iva * car.b2b.stellantis[state.tramoB2b]) : 0;
                defaultStellantisNeto = Math.max(defaultStellantisNeto, b2bStellantis);
            }
            state.aporteStellantisVal = defaultStellantisNeto;

            // Bono Red
            const topes = getTopes(car);
            const defaultBonoRedPct = state.tipoVenta === 'retail' ? ((pagoData.aporte_red_neto || 0) / car.precio_lista_sin_iva * 100) : topes.red;
            const safePct = state.excepcionTopes ? defaultBonoRedPct : Math.min(defaultBonoRedPct, topes.red);
            const defaultBonoRedNeto = car.precio_lista_sin_iva * (safePct / 100);
            state.bonoRedVal = defaultBonoRedNeto;

            // Aporte FI
            state.aporteFiVal = (pagoData.aporte_fi_neto || 0);

            // Accesorios
            state.accesoriosVal = 0;

            renderTripleInputs();
        };

        const toggleInputsDisable = (disabled) => {
            const els = [inputBonoRedNeto, inputBonoRedBruto, inputBonoRedPct, inputAporteStellantisNeto, inputAporteStellantisBruto, inputAporteStellantisPct, inputAporteFiNeto, inputAporteFiBruto, inputAccesoriosNeto, inputAccesoriosBruto];
            els.forEach(el => {
                if(el) el.disabled = disabled;
            });
        };

        const onCarChange = () => {
            if (state.modelo) {
                selectMedioPago.disabled = false;
                toggleInputsDisable(false);
                loadDefaults();
                calculate();
            } else {
                selectMedioPago.disabled = true;
                toggleInputsDisable(true);
                comparativaBox.classList.remove('active');
                document.getElementById('resUtilidad').classList.remove('semaforo-red', 'semaforo-yellow', 'semaforo-green');
            }
        };

        const updateModelos = () => {
            selectModelo.innerHTML = '<option value="">Seleccione un modelo</option>';
            if (!state.marca) {
                selectModelo.disabled = true;
                return;
            }
            const modelos = autos_db.filter(a => a.marca === state.marca).sort((a,b) => a.modelo.localeCompare(b.modelo));
            modelos.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.modelo;
                selectModelo.appendChild(opt);
            });
            selectModelo.disabled = false;
        };

        // Event Listeners

        // Tabs Venta
        const setTipoVenta = (tipo) => {
            if(state.tipoVenta === tipo) return;
            state.tipoVenta = tipo;
            if(tipo === 'retail') {
                tabRetail.classList.add('active');
                tabComercial.classList.remove('active');
            } else {
                tabComercial.classList.add('active');
                tabRetail.classList.remove('active');
            }
            updateLabels();
            if (state.modelo) {
                loadDefaults();
                calculate();
            }
        };

        tabRetail.addEventListener('click', () => setTipoVenta('retail'));
        tabComercial.addEventListener('click', () => setTipoVenta('comercial'));

        // Modal Semáforo
        const modal = document.getElementById('settingsModal');
        const btnSettings = document.getElementById('btnSettings');
        const btnCloseModal = document.getElementById('btnCloseModal');
        const inputUmbralRojo = document.getElementById('inputUmbralRojo');
        const inputUmbralVerde = document.getElementById('inputUmbralVerde');
        const btnSaveSettings = document.getElementById('btnSaveSettings');

        btnSettings.addEventListener('click', () => {
            inputUmbralRojo.value = state.umbralRojo;
            inputUmbralVerde.value = state.umbralVerde;
            modal.classList.add('show');
        });

        const closeModal = () => modal.classList.remove('show');
        btnCloseModal.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if(e.target === modal) closeModal();
        });

        btnSaveSettings.addEventListener('click', () => {
            state.umbralRojo = parseFloat(inputUmbralRojo.value) || 3;
            state.umbralVerde = parseFloat(inputUmbralVerde.value) || 6;
            closeModal();
            if(state.modelo) calculate();
        });

        // Other Controls
        selectTipoConcesionario.addEventListener('change', (e) => {
            state.tipoConcesionario = e.target.value;
            if (state.modelo && state.tipoVenta === 'comercial') {
                loadDefaults();
                calculate();
            }
        });

        selectTramoB2b.addEventListener('change', (e) => {
            state.tramoB2b = e.target.value;
            if (state.modelo && state.tipoVenta === 'comercial') {
                loadDefaults();
                calculate();
            }
        });

        selectMarca.addEventListener('change', (e) => {
            state.marca = e.target.value;
            state.modelo = null;
            updateModelos();
            onCarChange();
        });

        selectModelo.addEventListener('change', (e) => {
            state.modelo = e.target.value;
            onCarChange();
        });

        selectMedioPago.addEventListener('change', (e) => {
            state.medioPago = e.target.value;
            if (state.modelo) {
                loadDefaults();
                calculate();
            }
        });

        chkExcepcion.addEventListener('change', (e) => {
            state.excepcionTopes = e.target.checked;
            if(state.modelo) calculate();
        });

        const setupTripleMoneyInput = (netoId, brutoId, pctId, stateKey) => {
            const elNeto = document.getElementById(netoId);
            const elBruto = document.getElementById(brutoId);
            const elPct = pctId ? document.getElementById(pctId) : null;
            
            if(elNeto) elNeto.addEventListener('input', (e) => {
                applyMask(e.target);
                state[stateKey] = parseMoney(e.target.value);
                renderTripleInputs();
                calculate();
            });

            if(elBruto) elBruto.addEventListener('input', (e) => {
                applyMask(e.target);
                state[stateKey] = parseMoney(e.target.value) / 1.19;
                renderTripleInputs();
                calculate();
            });

            if (elPct) {
                elPct.addEventListener('input', (e) => {
                    if (!state.modelo) return;
                    const car = autos_db.find(a => a.id === state.modelo);
                    const pct = parseFloat(e.target.value) || 0;
                    state[stateKey] = car.precio_lista_sin_iva * (pct / 100);
                    renderTripleInputs();
                    calculate();
                });
            }
        };

        setupTripleMoneyInput('bonoRedNeto', 'bonoRedBruto', 'bonoRedPct', 'bonoRedVal');
        setupTripleMoneyInput('aporteStellantisNeto', 'aporteStellantisBruto', 'aporteStellantisPct', 'aporteStellantisVal');
        setupTripleMoneyInput('aporteFiNeto', 'aporteFiBruto', null, 'aporteFiVal');
        setupTripleMoneyInput('accesoriosNeto', 'accesoriosBruto', null, 'accesoriosVal');

        document.getElementById('btnReset').addEventListener('click', () => {
            setTipoVenta('retail');
            selectTipoConcesionario.value = "prof";
            selectTramoB2b.value = "t1";
            selectMarca.value = "";
            chkExcepcion.checked = false;
            state.excepcionTopes = false;
            
            selectModelo.innerHTML = '<option value="">Seleccione un modelo</option>';
            selectModelo.disabled = true;
            
            selectMedioPago.value = "contado";
            selectMedioPago.disabled = true;
            
            toggleInputsDisable(true);

            state.tipoConcesionario = 'prof';
            state.tramoB2b = 't1';
            state.marca = null;
            state.modelo = null;
            state.medioPago = 'contado';
            state.bonoRedVal = 0;
            state.aporteStellantisVal = 0;
            state.aporteFiVal = 0;
            state.accesoriosVal = 0;

            updateLabels();
            
            document.getElementById('resPrecioLista').textContent = '$0';
            document.getElementById('resAporteStellantis').textContent = '-$0';
            document.getElementById('resAporteFi').textContent = '-$0';
            document.getElementById('resBonoRed').textContent = '-$0';
            document.getElementById('resDescuentoTotal').textContent = '-$0';
            document.getElementById('resCosto').textContent = '$0';
            document.getElementById('resMargenTotal').textContent = '$0';
            const resUtilidad = document.getElementById('resUtilidad');
            resUtilidad.textContent = '$0 (0.00%)';
            resUtilidad.classList.remove('semaforo-red', 'semaforo-yellow', 'semaforo-green');
            document.getElementById('resFinalNeto').textContent = 'Neto: $0';
            document.getElementById('resFinalBruto').textContent = '$0';
            comparativaBox.classList.remove('active');
        });

        // Init
        updateLabels();

    