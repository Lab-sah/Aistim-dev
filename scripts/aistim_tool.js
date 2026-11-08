// ==UserScript==
// @name         AISTIM TOOL
// @namespace    http://tampermonkey.net/
// @version      1.0.3
// @description  Header Cek Selisih + filter Ada Selisih + hasil jadi text (tidak bisa diubah). Tidak aktif di halaman Koreksi SO & Pengisian Hasil SO
// @author       arimonox
// @match        https://*.erzap.com/stok_opnams*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // @match stok_opnams* juga kena halaman proses SO. Di sana Aistim Tool TIDAK boleh
    // jalan: auto-refresh 60 detik bisa memotong simpan koreksiso.js / menghapus isian
    // pengisian yang belum disimpan, dan filter "Ada Selisih" mencabut baris dari tabel
    // (input di baris itu jadi tidak ikut tersimpan). Jadi menu, kolom, filter, dan
    // auto-refresh semuanya dimatikan di halaman-halaman ini.
    // Sama dengan @match koreksiso.js (proses_koreksi_so/*) & pengisianso.js (proses_pengisian_hasil_so*)
    const HALAMAN_NONAKTIF = /^\/stok_opnams\/(proses_koreksi_so\/|proses_pengisian_hasil_so)/;
    if (HALAMAN_NONAKTIF.test(location.pathname)) {
        console.log('[AistimTool] Halaman proses SO (' + location.pathname + ') -> Aistim Tool tidak aktif di sini');
        return;
    }

    const CONFIG = {
        autoRefreshSeconds: 60
    };

    const STORAGE_KEY = 'erzap_filter';
    const PANEL_STATE_KEY = 'erzap_panel_collapsed';

    const SafeStorage = {
        _mem: {},
        get(key, def) {
            try {
                const v = localStorage.getItem(key);
                if (v !== null) return v;
            } catch (e) {}
            return this._mem[key] !== undefined ? this._mem[key] : def;
        },
        set(key, val) {
            this._mem[key] = val;
            try { localStorage.setItem(key, val); } catch (e) {}
        }
    };

    let allRows = [];
    let rowCounter = 0;
    let observer = null;
    let isFiltering = false;
    let nextRefreshTime = null;
    let countdownInterval = null;
    let refreshTimer = null;
    let initDone = false;
    let waitingTable = false;

    function log(...args) {
        console.log('[AistimTool]', ...args);
    }

    function analyzeRows(table) {
        const cover = [];
        const infos = [];
        for (const row of table.rows) {
            let covered = 0;
            for (let i = 0; i < cover.length; i++) if (cover[i] > 0) covered++;
            let col = 0;
            for (const cell of row.cells) {
                while (cover[col] > 0) col++;
                const rs = cell.rowSpan || 1;
                const cs = cell.colSpan || 1;
                for (let k = 0; k < cs; k++) cover[col + k] = rs;
                col += cs;
            }
            infos.push({ row, covered });
            for (let i = 0; i < cover.length; i++) if (cover[i] > 0) cover[i]--;
        }
        return infos;
    }

    function addKoreksiColumn() {
        if (isFiltering) return;
        const table = document.querySelector('table.no_data_table.table');
        if (!table) return;

        const infos = analyzeRows(table);
        if (!infos.length) return;

        const headerRows = infos.filter(({row}) => row.closest('thead') !== null || row.querySelector('th'));
        const koreksiAlreadyInHeader = headerRows.some(({row}) => row.querySelector('.koreksi-col'));
        let headerRowSpan = 1;
        if (headerRows.length > 0) {
            for (const c of headerRows[0].row.cells) headerRowSpan = Math.max(headerRowSpan, c.rowSpan || 1);
        }
        let headerAdded = koreksiAlreadyInHeader;
        let addedNew = false;

        infos.forEach(({row, covered}) => {
            if (row.querySelector('.koreksi-col')) return;
            if (row.getAttribute('data-koreksi-done') === '1') return;

            const inThead = row.closest('thead') !== null;
            const hasTh = row.querySelector('th') !== null;
            const isHeaderArea = inThead || hasTh;
            const isStructural = covered > 0;

            if (isHeaderArea) {
                if (!headerAdded) {
                    const th = document.createElement('th');
                    th.className = 'table-header-so koreksi-col';
                    th.style.textAlign = 'center';
                    th.style.verticalAlign = 'middle';
                    th.innerHTML = '<div>Cek Selisih</div>';
                    if (headerRowSpan > 1) th.rowSpan = headerRowSpan;
                    row.appendChild(th);
                    headerAdded = true;
                } else if (headerRowSpan === 1) {
                    const th = document.createElement('th');
                    th.className = 'table-header-so koreksi-col';
                    th.style.textAlign = 'center';
                    th.style.verticalAlign = 'middle';
                    th.innerHTML = '';
                    row.appendChild(th);
                }
                return;
            }

            if (isStructural) return;

            const firstCell = row.cells[0];
            const firstCellText = firstCell ? firstCell.textContent.trim() : '';
            const isBlankOrFilter = firstCellText === '';

            const td = document.createElement('td');
            td.className = 'koreksi-col';
            td.style.textAlign = 'center';
            td.style.verticalAlign = 'middle';

            let status = 'unknown';

            if (isBlankOrFilter) {
                td.innerHTML = '';
                td.style.border = 'none';
                status = 'blank';
            } else {
                // NaN = sel tidak terbaca. Baris seperti ini tidak boleh dianggap nol (Real).
                let nilaiPerhitungan = NaN;
                let nilaiStokSO = NaN;
                let teksPerhitunganCell = '';

                if (row.cells[5] && row.cells[6]) {
                    teksPerhitunganCell = row.cells[5].textContent.trim();
                    nilaiPerhitungan = parseFloat(teksPerhitunganCell.replace(/[^\d.-]/g, ''));
                    nilaiStokSO = parseFloat(row.cells[6].textContent.replace(/[^\d.-]/g, ''));
                }

                const isUncalculated = teksPerhitunganCell === 'PCS' || teksPerhitunganCell === '0.0 PCS';

                if (isUncalculated) {
                    td.innerHTML = '';
                    status = 'uncalculated';
                } else if (Number.isNaN(nilaiPerhitungan) || Number.isNaN(nilaiStokSO)) {
                    td.innerHTML = `<span style="font-weight: bold; color: gray;">?</span>`;
                    status = 'unknown';
                } else {
                    let hasilKoreksi = nilaiPerhitungan - nilaiStokSO;
                    if (hasilKoreksi === 0) {
                        td.innerHTML = `<span style="font-weight: bold; color: gray;">0</span>`;
                        status = 'nol';
                    } else {
                        let warnaTeks = hasilKoreksi < 0 ? 'red' : 'green';
                        td.innerHTML = `<span style="font-weight: bold; color: ${warnaTeks};">${hasilKoreksi}</span>`;
                        status = hasilKoreksi < 0 ? 'negatif' : 'positif';
                    }
                }
            }

            row.appendChild(td);
            row.setAttribute('data-row-idx', String(rowCounter++));
            row.setAttribute('data-koreksi-status', status);
            row.setAttribute('data-koreksi-done', '1');

            allRows.push({ element: row, status, index: rowCounter - 1 });
            addedNew = true;
        });

        if (addedNew) {
            updateFilterCounts();
            applyFilter();
        }
    }

    function getSavedFilter() {
        return SafeStorage.get(STORAGE_KEY, 'koreksi');
    }

    function saveFilter(value) {
        SafeStorage.set(STORAGE_KEY, value);
        log('Filter saved:', value);
    }

    function updateFilterCounts() {
        const select = document.getElementById('erzap-filter-select');
        if (!select) return;

        const counts = { semua: 0, negatif: 0, positif: 0, nol: 0, blank: 0, koreksi: 0 };
        allRows.forEach(({status}) => {
            counts.semua++;
            if (status === 'negatif') counts.negatif++;
            else if (status === 'positif') counts.positif++;
            else if (status === 'nol') counts.nol++;
            else if (status === 'blank' || status === 'uncalculated' || status === 'unknown') counts.blank++;
            if (status === 'negatif' || status === 'positif') counts.koreksi++;
        });

        const baseLabels = {
            semua: 'Semua',
            negatif: 'Negatif (-)',
            positif: 'Positif (+)',
            nol: 'Real',
            blank: 'Belum dicek',
            koreksi: 'Ada Selisih (-/+)'
        };

        Array.from(select.options).forEach(opt => {
            const key = opt.value;
            if (baseLabels[key]) {
                opt.textContent = `${baseLabels[key]} (${counts[key]})`;
            }
        });
    }

    function applyFilter() {
        if (isFiltering || allRows.length === 0) {
            log('applyFilter skipped:', {isFiltering, len: allRows.length});
            return;
        }
        isFiltering = true;
        if (observer) observer.disconnect();

        const filterValue = getSavedFilter();
        log('Applying filter:', filterValue);

        const table = document.querySelector('table.no_data_table.table');
        if (!table) {
            isFiltering = false;
            if (observer) observer.observe(document.body, { childList: true, subtree: true });
            return;
        }

        const tbody = table.querySelector('tbody');
        if (!tbody) {
            isFiltering = false;
            if (observer) observer.observe(document.body, { childList: true, subtree: true });
            return;
        }

        allRows.forEach(({element}) => {
            if (element.parentNode === tbody) {
                try { tbody.removeChild(element); } catch(e) {}
            }
        });

        let shown = 0;
        allRows.forEach(({element, status}) => {
            let show = true;
            switch (filterValue) {
                case 'negatif': show = status === 'negatif'; break;
                case 'positif': show = status === 'positif'; break;
                case 'nol': show = status === 'nol'; break;
                case 'blank': show = status === 'blank' || status === 'uncalculated' || status === 'unknown'; break;
                case 'koreksi': show = status === 'negatif' || status === 'positif'; break;
                case 'semua':
                default: show = true; break;
            }
            if (show) {
                tbody.appendChild(element);
                shown++;
            }
        });

        log('Filter result:', {filter: filterValue, shown, total: allRows.length});

        const select = document.getElementById('erzap-filter-select');
        if (select) select.value = filterValue;
        updateFilterCounts();

        if (observer) observer.observe(document.body, { childList: true, subtree: true });
        isFiltering = false;
    }

    function getPanelCollapsed() {
        return SafeStorage.get(PANEL_STATE_KEY, '0') === '1';
    }

    function savePanelCollapsed(collapsed) {
        SafeStorage.set(PANEL_STATE_KEY, collapsed ? '1' : '0');
    }

    function createPanel() {
        if (document.getElementById('erzap-panel')) return;

        // Cari menu Administrator
        let adminEl = null;
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            if (el.textContent && el.textContent.trim() === 'Administrator') {
                adminEl = el;
                break;
            }
        }

        // Buat wrapper menu item + dropdown (seperti menu Administrator)
        const wrapper = document.createElement('div');
        wrapper.id = 'erzap-wrapper';
        wrapper.style.cssText = 'position: relative; display: inline-block; cursor: pointer;';

        // Tombol menu yang terlihat di navbar
        const menuBtn = document.createElement('div');
        menuBtn.id = 'erzap-menu-btn';
        menuBtn.style.cssText = `
            padding: 8px 15px;
            background: #dc3545;
            color: #fff;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
            user-select: none;
        `;
        menuBtn.innerHTML = '⚙️ Aistim Tool <span id="erzap-menu-arrow" style="font-size:10px;">▼</span>';

        // Panel dropdown (default hidden, muncul saat menuBtn diklik)
        const panel = document.createElement('div');
        panel.id = 'erzap-panel';
        panel.style.cssText = `
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            z-index: 999999 !important;
            background: #dc3545;
            border: none;
            border-radius: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(255,165,0,0.4);
            width: 220px;
            overflow: hidden;
            color: #fff;
        `;

        // Toggle dropdown saat menuBtn diklik
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = panel.style.display === 'block';
            panel.style.display = isVisible ? 'none' : 'block';
            document.getElementById('erzap-menu-arrow').textContent = isVisible ? '▼' : '▲';
        });

        // Tutup dropdown saat klik di luar
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                panel.style.display = 'none';
                document.getElementById('erzap-menu-arrow').textContent = '▼';
            }
        });

        wrapper.appendChild(menuBtn);
        wrapper.appendChild(panel);

        // Sisipkan menu item ke navbar (sebelum/sesudah Administrator)
        if (adminEl) {
            const adminContainer = adminEl.closest('li, .nav-item, .menu-item, [class*="menu"], [class*="nav"]');
            if (adminContainer && adminContainer.parentNode) {
                adminContainer.parentNode.insertBefore(wrapper, adminContainer.nextSibling);
            } else {
                document.body.appendChild(wrapper);
                wrapper.style.position = 'fixed';
                wrapper.style.top = '10px';
                wrapper.style.right = '10px';
            }
        } else {
            document.body.appendChild(wrapper);
            wrapper.style.position = 'fixed';
            wrapper.style.top = '10px';
            wrapper.style.right = '10px';
        }

        // Style untuk option dropdown agar tidak putih
        if (!document.getElementById('erzap-panel-style')) {
            const style = document.createElement('style');
            style.id = 'erzap-panel-style';
            style.textContent = `
                select#erzap-filter-select option {
                    background: #c82333 !important;
                    color: #fff !important;
                    font-size: 14px;
                    padding: 8px 12px;
                }
            `;
            document.head.appendChild(style);
        }

        // ==== PANEL CONTENT ====
        const body = document.createElement('div');
        body.id = 'erzap-panel-body';
        body.style.cssText = `
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0;
            background: #dc3545;
        `;

        const filterLabel = document.createElement('div');
        filterLabel.textContent = 'Filter Tampilan:';
        filterLabel.style.cssText = 'color: #fff; padding: 8px 12px 4px 12px; font-size: 13px; font-weight: 500;';

        const filterSelect = document.createElement('select');
        filterSelect.id = 'erzap-filter-select';
        filterSelect.disabled = false;
        filterSelect.style.cssText = `
            padding: 10px 12px 10px 12px;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.3);
            font-size: 14px;
            cursor: pointer;
            background: #c82333;
            background-color: #c82333;
            color: #fff;
            width: 100%;
            pointer-events: auto !important;
            opacity: 1 !important;
            min-height: 40px;
            outline: none;
            text-align: left;
            box-sizing: border-box;
            margin: 0;
        `;

        const options = [
            { value: 'semua', text: 'Semua' },
            { value: 'koreksi', text: 'Ada Selisih (-/+)' },
            { value: 'negatif', text: 'Negatif (-)' },
            { value: 'positif', text: 'Positif (+)' },
            { value: 'nol', text: 'Real' },
            { value: 'blank', text: 'Belum dicek' }
        ];

        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.text;
            filterSelect.appendChild(o);
        });

        filterSelect.value = getSavedFilter();

        const onFilterChange = (e) => {
            saveFilter(e.target.value);
            applyFilter();
        };
        filterSelect.addEventListener('change', onFilterChange);
        filterSelect.addEventListener('touchend', (e) => {
            e.stopPropagation();
        }, { passive: true });

        const divider = document.createElement('div');
        divider.style.cssText = 'border-top: 1px solid rgba(255,255,255,0.2); margin: 0;';

        const refreshLabel = document.createElement('div');
        refreshLabel.textContent = 'Auto Refresh:';
        refreshLabel.style.cssText = 'color: #fff; padding: 8px 12px 4px 12px; font-size: 13px; font-weight: 500;';

        const countdown = document.createElement('div');
        countdown.id = 'erzap-refresh-countdown';
        countdown.textContent = CONFIG.autoRefreshSeconds > 0 ? 'Menunggu...' : 'Mati';
        countdown.style.cssText = 'color: #fff; font-family: monospace; font-size: 13px; padding: 0 12px 8px 12px;';

        const btnRefresh = document.createElement('button');
        btnRefresh.textContent = '🔄 Refresh Sekarang';
        btnRefresh.style.cssText = `
            background: rgba(0,0,0,0.15);
            color: #fff;
            border: none;
            border-radius: 0;
            border-top: 1px solid rgba(255,255,255,0.2);
            padding: 10px 12px;
            font-size: 13px;
            cursor: pointer;
            font-weight: 500;
            width: 100%;
            text-align: left;
        `;
        btnRefresh.onmouseenter = () => btnRefresh.style.background = 'rgba(0,0,0,0.25)';
        btnRefresh.onmouseleave = () => btnRefresh.style.background = 'rgba(0,0,0,0.15)';
        btnRefresh.ontouchstart = () => btnRefresh.style.background = 'rgba(0,0,0,0.25)';
        btnRefresh.ontouchend = () => btnRefresh.style.background = 'rgba(0,0,0,0.15)';
        btnRefresh.onclick = () => location.reload();

        body.appendChild(filterLabel);
        body.appendChild(filterSelect);
        body.appendChild(divider);
        body.appendChild(refreshLabel);
        body.appendChild(countdown);
        body.appendChild(btnRefresh);

        const credit = document.createElement('div');
        credit.textContent = 'created by aistim';
        credit.style.cssText = 'color: rgba(255,255,255,0.5); font-size: 10px; text-align: center; padding: 4px 0; font-style: italic;';
        body.appendChild(credit);

        panel.appendChild(body);

        updateFilterCounts();
        log('Panel created');
    }

    function formatCountdown(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function startAutoRefresh() {
        if (!CONFIG.autoRefreshSeconds || CONFIG.autoRefreshSeconds <= 0) return;
        const intervalMs = CONFIG.autoRefreshSeconds * 1000;
        nextRefreshTime = Date.now() + intervalMs;

        countdownInterval = setInterval(() => {
            const el = document.getElementById('erzap-refresh-countdown');
            if (!el || !nextRefreshTime) return;
            const remainingSec = Math.ceil((nextRefreshTime - Date.now()) / 1000);
            if (remainingSec <= 0) {
                el.textContent = 'Refreshing...';
            } else {
                el.textContent = 'Next: ' + formatCountdown(remainingSec);
            }
        }, 1000);

        refreshTimer = setTimeout(() => {
            location.reload();
        }, intervalMs);
    }

    function init() {
        if (initDone) return;
        log('Initializing...');
        addKoreksiColumn();
        createPanel();
        startAutoRefresh();
        initDone = true;
        log('Init complete. Rows:', allRows.length);
    }

    // Hanya satu penunggu tabel yang aktif pada satu waktu (sebelumnya bisa menumpuk tiap detik).
    function waitAndInit() {
        if (initDone || waitingTable) return;
        if (document.querySelector('table.no_data_table.table')) {
            init();
            return;
        }
        waitingTable = true;
        log('Table not found, waiting...');
        const checkTimer = setInterval(() => {
            if (document.querySelector('table.no_data_table.table')) {
                clearInterval(checkTimer);
                waitingTable = false;
                init();
            }
        }, 500);
        setTimeout(() => {
            clearInterval(checkTimer);
            waitingTable = false;
        }, 15000);
    }

    observer = new MutationObserver(() => {
        if (!initDone) return;
        addKoreksiColumn();
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitAndInit);
    } else {
        waitAndInit();
    }

    // Polling hanya sampai init selesai. Setelah itu MutationObserver yang menangani baris baru.
    const pollInit = setInterval(() => {
        if (initDone) {
            clearInterval(pollInit);
            return;
        }
        waitAndInit();
    }, 1000);

})();