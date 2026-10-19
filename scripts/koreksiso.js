// ==UserScript==
// @name         Erzap - Auto Koreksi
// @namespace    http://tampermonkey.net/
// @version      1.12.1
// @updateURL    https://raw.githubusercontent.com/devtim-lab/Aistim-dev/main/scripts/koreksiso.js
// @downloadURL  https://raw.githubusercontent.com/devtim-lab/Aistim-dev/main/scripts/koreksiso.js
// @description  [v1.12.1] Hanya lanjut otomatis kalau halaman dibuka oleh script sendiri (maks 1 menit) - buka halaman koreksi manual tidak pernah auto jalan. Ganti ID SO = mulai dari awal (isi pengkoreksi & tanggal lagi, tidak auto jalan). Halaman tanpa tombol Simpan dilewati; di akhir cek ulang semua halaman -> SO SELESAI, stop & refresh halaman. Nama Pengkoreksi & Tanggal Koreksi diisi manual sebelum START (dipakai untuk semua halaman). Alur: KOREKSI (Koreksi teratas = Hasil SO, Koreksi ke-2 dst = 0) -> SIMPAN (Enter) -> RELOAD. Tombol CEK SIMPAN: lewati halaman tanpa tombol Simpan, pindah ke halaman berikutnya yang masih ada tombol Simpan lalu langsung isi
// @author       You
// @match        https://*.erzap.com/stok_opnams/proses_koreksi_so/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @world        main
// @grant        none
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    // ID SO dari URL: /stok_opnams/proses_koreksi_so/<ID>
    function idSO() {
        const m = location.pathname.match(/proses_koreksi_so\/([^\/?#]+)/);
        return m ? m[1] : '';
    }

    // Semua status (auto jalan, isian pengkoreksi & tanggal, log, rangkuman) disimpan
    // per tab, bukan per SO. Kalau ID SO berubah (buka SO lain di tab yang sama),
    // buang semuanya: SO baru harus mulai dari awal -- isi pengkoreksi & tanggal lagi,
    // dan TIDAK boleh auto jalan meneruskan proses SO sebelumnya.
    (function resetKalauSOBerubah() {
        const idLama = sessionStorage.getItem('erzap_so_id');
        if (!idLama || idLama === idSO()) return;
        ['erzap_auto_running', 'erzap_isian_manual', 'erzap_page_logs', 'erzap_max_page',
         'erzap_rangkuman_tertunda', 'erzap_so_id'].forEach(k => sessionStorage.removeItem(k));
        console.log('[Aistim] Koreksi: ID SO berubah (' + idLama + ' -> ' + idSO() + '), status proses direset');
    })();

    // Lanjut otomatis HANYA kalau halaman ini dibuka oleh script sendiri: sebelum
    // pindah halaman / simpan (yang bisa memuat ulang halaman), script menitip tanda
    // { so, t }. Tanpa tanda yang sah (SO sama, umurnya < 1 menit) status "auto jalan"
    // dianggap sisa proses lama -> dimatikan. Jadi membuka halaman koreksi secara
    // manual (SO lain, SO yang sama, atau tab yang dipulihkan) tidak pernah auto jalan.
    // Tanda langsung dihapus setelah dibaca, hanya berlaku untuk satu kali muat halaman.
    const TANDA_LANJUT = 'erzap_lanjut_oleh_script';
    const TANDA_LANJUT_MAKS_MS = 60000;
    function tandaiLanjutOlehScript() {
        sessionStorage.setItem(TANDA_LANJUT, JSON.stringify({ so: idSO(), t: Date.now() }));
    }
    (function cekBolehLanjut() {
        let tanda = null;
        try { tanda = JSON.parse(sessionStorage.getItem(TANDA_LANJUT) || 'null'); } catch (e) {}
        sessionStorage.removeItem(TANDA_LANJUT);
        if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;
        const umur = tanda ? Date.now() - tanda.t : -1;
        if (tanda && tanda.so === idSO() && umur >= 0 && umur < TANDA_LANJUT_MAKS_MS) return;
        sessionStorage.setItem('erzap_auto_running', 'false');
        console.log('[Aistim] Koreksi: halaman tidak dibuka oleh proses auto (' +
            (tanda ? 'tanda ' + (tanda.so !== idSO() ? 'SO lain' : 'kedaluwarsa') : 'tanpa tanda') +
            ') -> tidak lanjut otomatis');
    })();

    let isRunning = sessionStorage.getItem('erzap_auto_running') === 'true';

    // Script ini jalan di @world main, jadi jQuery milik halaman bisa diakses.
    function jq() {
        return window.jQuery || window.$ || null;
    }

    // Erzap nampilkan #ok_disable selama request simpan masih jalan (pola yang sama
    // dipakai olzap.js). Dipakai buat tau kapan simpan beres, jadi gak perlu nebak
    // pakai jeda tetap yang kepanjangan.
    function sedangMenyimpan() {
        const ok = document.getElementById('ok_disable');
        return !!(ok && window.getComputedStyle(ok).display !== 'none');
    }

    // Detektor simpan. #ok_disable saja tidak cukup: kalau elemen itu ternyata tidak
    // ada di halaman koreksi, fallback ke tombol akan selalu jalan walau Enter-nya
    // sudah berhasil -> kesimpan dua kali. Jadi dipantau juga semua request dan
    // event submit form.
    //
    // Request dipantau langsung di XMLHttpRequest & fetch (bukan event $.ajax):
    // simpan Erzap yang tidak lewat jQuery dulu tidak kedeteksi, sehingga halaman
    // yang sukses tersimpan malah tercatat "Tidak Pasti" di rangkuman.
    //
    // Sengaja bias ke arah "anggap simpan sudah jalan": kalau salah tebak, akibatnya
    // satu halaman tidak tersimpan (kelihatan di data), jauh lebih aman daripada
    // koreksi ganda yang diam-diam masuk dua kali.
    let simpanTerdeteksi = false;
    let simpanError = false;
    let requestAktif = 0;
    let detektorTerpasang = false;

    const KOREKSI_SELECTOR = 'input[type="text"][name*="jumlah_koreksi"]';

    // Kunci satu alur per dokumen: mencegah dua rantai proses jalan barengan
    // (mis. tombol dibuat ulang oleh MutationObserver lalu resume lagi).
    let alurAktif = false;
    function mulaiAlur(btn) {
        if (alurAktif) return;
        alurAktif = true;
        runAutoProcess(btn);
    }

    // Status "auto jalan" disimpan di sessionStorage supaya proses berlanjut sendiri
    // setelah pindah halaman (lihat resume di initControls).
    // Nama Pengkoreksi & Tanggal Koreksi diisi MANUAL oleh user di halaman sebelum
    // START / CEK SIMPAN. Nilainya disimpan supaya halaman-halaman berikutnya (yang
    // terbuka kosong lagi setelah pindah halaman) diisi dengan nilai yang sama.
    // Return false (dan tampilkan pesan) kalau masih ada yang kosong.
    function simpanIsianManual() {
        const p = document.getElementById('stok_opnam_pengkoreksi');
        const t = document.getElementById('stok_opnam_tanggal_koreksi');
        const isian = { pengkoreksi: p ? p.value.trim() : '', tanggal: t ? t.value.trim() : '' };
        const kurang = [];
        if (p && !isian.pengkoreksi) kurang.push('Nama Pengkoreksi');
        if (t && !isian.tanggal) kurang.push('Tanggal Koreksi');
        if (kurang.length) {
            tampilkanPesanCek('Isi dulu ' + kurang.join(' & '),
                'Isi ' + kurang.join(' dan ') + ' secara manual di halaman ini, lalu klik lagi. Nilainya dipakai untuk semua halaman.', true);
            try { (p && !isian.pengkoreksi ? p : t).focus(); } catch (e) {}
            return false;
        }
        sessionStorage.setItem('erzap_isian_manual', JSON.stringify(isian));
        return true;
    }

    function tandaiAutoMulai() {
        sessionStorage.setItem('erzap_so_id', idSO());
        sessionStorage.setItem('erzap_auto_running', 'true');
        sessionStorage.setItem('erzap_max_page', '1');
        sessionStorage.removeItem('erzap_page_logs');
        isRunning = true;
    }

    function catatStatus(page, status) {
        const logs = JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}');
        logs[page] = status;
        sessionStorage.setItem('erzap_page_logs', JSON.stringify(logs));
    }

    function requestMulai() {
        simpanTerdeteksi = true;
        requestAktif++;
    }

    // status 0 = gagal jaringan / dibatalkan; 2xx & 3xx dianggap sukses
    function requestSelesai(status) {
        if (requestAktif > 0) requestAktif--;
        if (!(status >= 200 && status < 400)) simpanError = true;
    }

    function pasangDetektorSimpan() {
        if (detektorTerpasang) return;
        detektorTerpasang = true;

        const XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
        if (XHR) {
            const sendAsli = XHR.send;
            XHR.send = function () {
                requestMulai();
                this.addEventListener('loadend', () => requestSelesai(this.status));
                return sendAsli.apply(this, arguments);
            };
        }

        if (typeof window.fetch === 'function') {
            const fetchAsli = window.fetch;
            window.fetch = function () {
                requestMulai();
                return fetchAsli.apply(this, arguments).then(
                    res => { requestSelesai(res.status); return res; },
                    err => { requestSelesai(0); throw err; }
                );
            };
        }

        document.addEventListener('submit', function () { simpanTerdeteksi = true; }, true);
    }

    function simpanSedangJalan() {
        return sedangMenyimpan() || requestAktif > 0;
    }

    // Tekan Enter di sebuah input, versi yang beneran sampai ke handler halaman.
    //
    // Catatan penting: konstruktor KeyboardEvent MENGABAIKAN keyCode/which — dua properti
    // itu read-only dan tetap bernilai 0 walau diisi di init dict. Handler jQuery Erzap
    // ngecek e.which === 13, jadi event native saja tidak pernah nyangkut (ini sebab
    // percobaan Enter di v1.3.3-1.3.8 gagal). Karena itu dipicu lewat $.Event juga.
    function tekanEnter(inp) {
        if (!inp) return false;
        inp.focus();
        const ev = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        inp.dispatchEvent(new KeyboardEvent('keydown', ev));
        inp.dispatchEvent(new KeyboardEvent('keypress', ev));
        inp.dispatchEvent(new KeyboardEvent('keyup', ev));
        const $ = jq();
        if ($) {
            $(inp).trigger($.Event('keydown', { which: 13, keyCode: 13 }));
            $(inp).trigger($.Event('keypress', { which: 13, keyCode: 13 }));
        }
        return true;
    }

    function getCurrentPageNumber() {
        const n = nomorHalaman(document, location.href);
        return n !== null ? n : 1;
    }

    let maxVisitedPage = parseInt(sessionStorage.getItem('erzap_max_page') || '1');
    let currentPage = getCurrentPageNumber();
    if (currentPage > maxVisitedPage) {
        maxVisitedPage = currentPage;
        sessionStorage.setItem('erzap_max_page', maxVisitedPage);
    }

    let pageLogs = JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}');

    function showPaginatedSummaryPopup(message, logs) {
        const existingModal = document.getElementById('customAlertModal');
        if (existingModal) existingModal.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'customAlertModal';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '99999';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.padding = '16px';
        modalOverlay.style.boxSizing = 'border-box';

        const modalBox = document.createElement('div');
        modalBox.style.backgroundColor = '#fff';
        modalBox.style.padding = '25px 30px';
        modalBox.style.borderRadius = '8px';
        modalBox.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
        modalBox.style.textAlign = 'center';
        modalBox.style.width = 'min(450px, calc(100vw - 32px))';
        modalBox.style.boxSizing = 'border-box';
        modalBox.style.maxHeight = '90vh';
        modalBox.style.overflowY = 'auto';

        const modalText = document.createElement('p');
        modalText.textContent = message;
        modalText.style.fontSize = '16px';
        modalText.style.color = '#333';
        modalText.style.marginBottom = '15px';
        modalText.style.fontWeight = 'bold';

        let logKeys = Object.keys(logs).sort((a, b) => parseInt(a) - parseInt(b));
        let currentPopupPage = 1;
        const itemsPerPage = 10;
        let totalPopupPages = Math.ceil(logKeys.length / itemsPerPage) || 1;

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginBottom = '15px';

        const thead = document.createElement('thead');
        thead.innerHTML = `<tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
            <th style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">Halaman (Page)</th>
            <th style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">Status Save</th>
        </tr>`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        table.appendChild(tbody);

        const paginationDiv = document.createElement('div');
        paginationDiv.style.display = 'flex';
        paginationDiv.style.justifyContent = 'space-between';
        paginationDiv.style.alignItems = 'center';
        paginationDiv.style.marginBottom = '20px';

        const prevBtn = document.createElement('button');
        prevBtn.textContent = '‹ Sebelumnya';
        prevBtn.className = 'btn btn-default btn-sm';
        prevBtn.style.padding = '5px 10px';
        prevBtn.style.fontSize = '12px';

        const pageInfo = document.createElement('span');
        pageInfo.style.fontSize = '13px';
        pageInfo.style.color = '#555';

        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Selanjutnya ›';
        nextBtn.className = 'btn btn-default btn-sm';
        nextBtn.style.padding = '5px 10px';
        nextBtn.style.fontSize = '12px';

        function renderTablePage(p) {
            tbody.innerHTML = '';
            let start = (p - 1) * itemsPerPage;
            let end = start + itemsPerPage;
            let slicedKeys = logKeys.slice(start, end);

            if (slicedKeys.length === 0) {
                let row = document.createElement('tr');
                row.innerHTML = `<td colspan="2" style="padding: 10px; text-align: center; color: #777;">Tidak ada data.</td>`;
                tbody.appendChild(row);
            } else {
                slicedKeys.forEach(pageNum => {
                    let status = logs[pageNum];
                    let statusColor = status === 'Berhasil' ? '#28a745'
                        : status === 'Tidak Pasti' ? '#fd7e14'
                        : status === 'Sudah tersimpan' ? '#6c757d' : '#dc3545';

                    const row = document.createElement('tr');
                    row.innerHTML = `<td style="padding: 8px; border: 1px solid #dee2e6; text-align: center;">Page ${pageNum}</td>
                                     <td style="padding: 8px; border: 1px solid #dee2e6; text-align: center; color: ${statusColor}; font-weight: bold;">${status}</td>`;
                    tbody.appendChild(row);
                });
            }

            pageInfo.textContent = `Hal ${p} dari ${totalPopupPages}`;
            prevBtn.disabled = p <= 1;
            prevBtn.style.opacity = p <= 1 ? '0.5' : '1';
            nextBtn.disabled = p >= totalPopupPages;
            nextBtn.style.opacity = p >= totalPopupPages ? '0.5' : '1';
        }

        prevBtn.addEventListener('click', function() {
            if (currentPopupPage > 1) {
                currentPopupPage--;
                renderTablePage(currentPopupPage);
            }
        });

        nextBtn.addEventListener('click', function() {
            if (currentPopupPage < totalPopupPages) {
                currentPopupPage++;
                renderTablePage(currentPopupPage);
            }
        });

        paginationDiv.appendChild(prevBtn);
        paginationDiv.appendChild(pageInfo);
        paginationDiv.appendChild(nextBtn);

        renderTablePage(currentPopupPage);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'OK';
        closeBtn.className = 'btn btn-success';
        closeBtn.style.padding = '8px 25px';
        closeBtn.style.fontSize = '14px';
        closeBtn.style.backgroundColor = '#28a745';
        closeBtn.style.color = '#fff';
        closeBtn.style.border = 'none';
        closeBtn.style.borderRadius = '4px';
        closeBtn.style.cursor = 'pointer';

        closeBtn.addEventListener('click', function() {
            modalOverlay.remove();
            sessionStorage.removeItem('erzap_max_page');
            sessionStorage.removeItem('erzap_page_logs');
        });

        modalBox.appendChild(modalText);
        modalBox.appendChild(table);
        modalBox.appendChild(paginationDiv);
        modalBox.appendChild(closeBtn);
        modalOverlay.appendChild(modalBox);
        document.body.appendChild(modalOverlay);
    }

    function injectResponsiveStyle() {
        if (document.getElementById('autoKoreksiStyle')) return;
        const style = document.createElement('style');
        style.id = 'autoKoreksiStyle';
        style.textContent = `
            /* Desktop: tombol inline di samping tombol FIFO */
            #autoKoreksiGroup {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-right: 5px;
                vertical-align: middle;
            }
            #autoKoreksiGroup button {
                white-space: nowrap;
            }

            /* Mobile / layar kecil: tombol jadi bar mengambang di bawah layar */
            @media (max-width: 768px) {
                #autoKoreksiGroup {
                    position: fixed !important;
                    left: 8px !important;
                    right: 8px !important;
                    bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
                    top: auto !important;
                    z-index: 99998 !important;
                    display: flex !important;
                    flex-wrap: wrap !important;
                    gap: 8px !important;
                    margin: 0 !important;
                    padding: 8px !important;
                    background: rgba(255, 255, 255, 0.97) !important;
                    border-radius: 10px !important;
                    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.25) !important;
                    box-sizing: border-box !important;
                }
                #autoKoreksiGroup button {
                    flex: 1 1 0 !important;
                    min-width: 90px !important;   /* jangan sampai teks status kepotong */
                    max-width: 100% !important;
                    min-height: 44px !important;   /* standar sentuh mobile */
                    font-size: 14px !important;
                    font-weight: bold !important;
                    margin: 0 !important;
                    padding: 0 8px !important;
                    border-radius: 6px !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    box-sizing: border-box !important;
                }
            }

            /* Layar sangat sempit: kecilkan lagi biar teks status ("KOREKSI...", "RELOAD...") tetap muat */
            @media (max-width: 380px) {
                #autoKoreksiGroup button {
                    font-size: 12px !important;
                    padding: 0 4px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function findFifoBtn() {
        const allElements = document.querySelectorAll('a, button');
        for (let el of allElements) {
            if (el.textContent.trim() === 'FIFO') return el;
        }
        return null;
    }

    // Samakan ukuran tombol START/STOP dengan tombol FIFO di sebelahnya.
    // Dipanggil berulang (bukan cuma sekali saat dibuat) karena ukuran FIFO
    // sendiri bisa berubah setelah render awal (mis. CSS/class-nya baru
    // lengkap belakangan), dan supaya ikut ke-update kalau layar di-resize.
    function syncSizeWithFifo() {
        const startBtn = document.getElementById('startAutoBtn');
        const stopBtn = document.getElementById('stopAutoBtn');
        const cekBtn = document.getElementById('cekSimpanBtn');
        const targetBtn = findFifoBtn();
        if (!startBtn || !stopBtn || !targetBtn) return;

        const rect = targetBtn.getBoundingClientRect();
        if (!rect.height) return; // FIFO belum sempat ke-render, coba lagi di tick berikutnya

        const cs = window.getComputedStyle(targetBtn);

        [startBtn, cekBtn, stopBtn].filter(Boolean).forEach(btn => {
            btn.style.boxSizing = 'border-box';
            btn.style.paddingTop = cs.paddingTop;
            btn.style.paddingBottom = cs.paddingBottom;
            btn.style.paddingLeft = cs.paddingLeft;
            btn.style.paddingRight = cs.paddingRight;
            btn.style.fontSize = cs.fontSize;
            btn.style.lineHeight = cs.lineHeight;
            btn.style.fontWeight = cs.fontWeight;
            // Pakai satu nilai radius simetris (bukan cs.borderRadius apa adanya),
            // karena FIFO ada di dalam btn-group jadi radiusnya "6px 0 0 6px" (nempel ke DETAIL).
            // Kalau dicopy mentah, START/STOP jadi kelihatan kepotong sebelah karena
            // keduanya berdiri sendiri (ada gap), bukan nempel ke tombol lain.
            btn.style.borderRadius = cs.borderTopLeftRadius;
            btn.style.borderWidth = cs.borderWidth;
            // Pakai tinggi hasil render nyata (getBoundingClientRect), bukan
            // computed style 'height' yang bisa saja masih 'auto'/belum akurat.
            btn.style.height = rect.height + 'px';
            btn.style.verticalAlign = 'middle';
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
        });
    }

    // ===== CEK SIMPAN: cari halaman berikutnya yang masih ada tombol Simpan =====
    // Halaman yang sudah dikoreksi & disimpan tidak punya tombol Simpan lagi. Mulai dari
    // halaman ini: kalau tombol Simpan tidak ada, lanjut ke halaman berikutnya (dibaca
    // lewat fetch di belakang layar, mengikuti link pagination asli Erzap), sampai
    // ketemu halaman yang masih ada tombol Simpan -> langsung pindah ke halaman itu.
    let cekJalan = false;
    let cekDibatalkan = false;

    function bersihkanUrl(href, base) {
        if (!href || href === '#' || /^javascript:/i.test(href)) return null;
        try {
            const u = new URL(href, base);
            u.hash = '';
            return u.origin === location.origin ? u.href : null;
        } catch (e) { return null; }
    }

    // Nomor halaman yang sedang tampil di dokumen: dari item pagination yang aktif,
    // atau parameter ?page= di URL. null kalau tidak ketahuan.
    function nomorHalaman(doc, url) {
        const aktif = doc.querySelector(
            '.pagination .active, .pagination .current, .pagination [aria-current="page"], ' +
            '[class*="paginat"] .active, [class*="paginat"] .current, [class*="paginat"] [aria-current="page"], ' +
            '[class*="paginat"] .page_num');
        const n = aktif ? parseInt(aktif.textContent.trim(), 10) : NaN;
        if (!isNaN(n)) return n;
        try {
            const q = parseInt(new URL(url).searchParams.get('page'), 10);
            if (!isNaN(q)) return q;
        } catch (e) {}
        return null;
    }

    // Tombol Simpan = #simpan (elemen yang sama yang diklik proses auto).
    // Halaman ini: cek benar-benar tampil. Dokumen hasil fetch tidak dirender, jadi
    // cukup ada & tidak disembunyikan lewat style="display:none" / hidden.
    function tombolSimpanTampil() {
        const el = document.getElementById('simpan');
        return !!(el && el.getClientRects().length);
    }

    function adaTombolSimpan(doc) {
        const el = doc.getElementById('simpan');
        if (!el) return false;
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            if (n.hidden || /display\s*:\s*none/i.test(n.getAttribute('style') || '')) return false;
        }
        return true;
    }

    // Baca satu halaman: { nomor, simpan, next, url, cara }.
    // Cepat dulu lewat fetch (HTML mentah). Tapi kalau isi tabel tidak ada di HTML
    // mentah (tabel dimuat JavaScript setelah halaman terbuka), tidak adanya tombol
    // Simpan di situ TIDAK berarti sudah tersimpan -> buka di iframe tersembunyi
    // supaya JavaScript Erzap sempat merender tabel & tombolnya, baru dicek.
    async function bacaHalaman(url) {
        const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' saat membuka halaman berikutnya');
        const urlAsli = res.url || url;
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

        const adaIsi = !!(doc.getElementById('simpan') || doc.querySelector('td[id^="so"], ' + KOREKSI_SELECTOR));
        if (adaIsi) {
            const next = cariLinkBerikutnya(doc, false);
            const prev = cariLinkBerikutnya(doc, false, 'prev');
            return {
                nomor: nomorHalaman(doc, urlAsli),
                simpan: adaTombolSimpan(doc),
                next: next ? bersihkanUrl(next.getAttribute('href'), urlAsli) : null,
                prev: prev ? bersihkanUrl(prev.getAttribute('href'), urlAsli) : null,
                url: urlAsli,
                cara: 'fetch'
            };
        }
        return bacaLewatIframe(url);
    }

    function bacaLewatIframe(url) {
        return new Promise((resolve, reject) => {
            const f = document.createElement('iframe');
            f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;visibility:hidden;border:0;';
            let selesai = false;
            const beres = (err, hasil) => {
                if (selesai) return;
                selesai = true;
                clearTimeout(batas);
                f.remove();
                if (err) reject(err); else resolve(hasil);
            };
            const batas = setTimeout(() => beres(new Error('Tabel tidak muncul dalam 15 detik saat membuka ' + url)), 15000);

            f.addEventListener('load', () => {
                let nunggu = 0;
                let sejakLoad = 0;
                (function cek() {
                    if (selesai) return;
                    let d;
                    try { d = f.contentDocument; } catch (e) { beres(new Error('Halaman tidak bisa dibaca (' + e.message + ')')); return; }
                    const adaIsi = d && (d.getElementById('simpan') || d.querySelector('td[id^="so"], ' + KOREKSI_SELECTOR));
                    // Tetap kosong 4 detik setelah load, tapi halamannya jelas halaman daftar
                    // (ada tabel / pagination) -> halaman sudah tersimpan, tidak ada isian lagi.
                    const halamanKosong = !adaIsi && sejakLoad >= 4000 && d &&
                        d.querySelector('table, .pagination, [class*="paginat"]');
                    // Setelah isi tabel muncul, beri 0,5 detik supaya tombol Simpan ikut dirender
                    if ((adaIsi && nunggu >= 500) || halamanKosong) {
                        const el = d.getElementById('simpan');
                        const next = cariLinkBerikutnya(d, false);
                        const prev = cariLinkBerikutnya(d, false, 'prev');
                        const urlAsli = f.contentWindow.location.href;
                        beres(null, {
                            nomor: nomorHalaman(d, urlAsli),
                            simpan: !!(el && el.getClientRects().length),
                            next: next ? bersihkanUrl(next.getAttribute('href'), urlAsli) : null,
                            prev: prev ? bersihkanUrl(prev.getAttribute('href'), urlAsli) : null,
                            url: urlAsli,
                            cara: 'iframe'
                        });
                        return;
                    }
                    if (adaIsi) nunggu += 100;
                    sejakLoad += 100;
                    setTimeout(cek, 100);
                })();
            });
            f.src = url;
            document.body.appendChild(f);
        });
    }

    async function cariHalamanBelumSimpan(btn) {
        const nomorIni = getCurrentPageNumber();
        // Halaman ini sendiri belum disimpan -> langsung isi di sini
        if (tombolSimpanTampil()) {
            if (!simpanIsianManual()) return;
            tandaiAutoMulai();
            mulaiAlur(document.getElementById('startAutoBtn'));
            return;
        }

        cekJalan = true;
        cekDibatalkan = false;
        const teksAsli = btn.textContent;
        btn.disabled = true;

        let dicek = 1;
        let nomorTerakhir = nomorIni;
        let pesanError = '';
        const dikunjungi = new Set([bersihkanUrl(location.href, location.href)]);
        const nomorDibaca = new Set([nomorIni]);

        try {
            const link = cariLinkBerikutnya(document, true);
            let url = link ? bersihkanUrl(link.getAttribute('href'), location.href) : null;

            while (url && !dikunjungi.has(url) && dikunjungi.size < 500) {
                if (cekDibatalkan) break;
                dikunjungi.add(url);
                btn.textContent = 'CEK HAL ' + (nomorTerakhir + 1) + '...';

                const hal = await bacaHalaman(url);
                if (cekDibatalkan) break;
                const nomor = hal.nomor;
                if (nomor !== null) {
                    if (nomorDibaca.has(nomor)) break; // balik ke halaman yang sudah dicek = sudah habis
                    nomorDibaca.add(nomor);
                    nomorTerakhir = nomor;
                } else {
                    nomorTerakhir++;
                }
                dicek++;

                // Ketemu -> tandai auto jalan lalu pindah; di halaman itu proses isi & simpan
                // (sama dengan START AUTO) langsung mulai sendiri lewat resume di initControls.
                if (hal.simpan) {
                    if (!simpanIsianManual()) {
                        btn.textContent = teksAsli;
                        btn.disabled = false;
                        cekJalan = false;
                        return;
                    }
                    btn.textContent = 'KE HAL ' + nomorTerakhir + '...';
                    console.log('[Aistim] Cek simpan: tombol Simpan ada di', hal.url, '(' + hal.cara + ') -> pindah & isi');
                    tandaiAutoMulai();
                    tandaiLanjutOlehScript();
                    location.href = url;
                    return; // cekJalan dibiarkan true: halaman akan berganti
                }

                url = hal.next;
            }
        } catch (e) {
            pesanError = String(e && e.message || e);
            console.error('[Aistim] Cek simpan gagal:', e);
        }

        btn.textContent = teksAsli;
        btn.disabled = false;
        cekJalan = false;
        if (cekDibatalkan) return; // STOP sudah menampilkan pesannya sendiri
        if (pesanError) {
            tampilkanPesanCek('Cek berhenti', 'Dicek ' + dicek + ' halaman (sampai Hal ' + nomorTerakhir + '). ' + pesanError, true);
        } else {
            tampilkanPesanCek('Semua halaman sudah tersimpan ✓',
                'Dari Hal ' + nomorIni + ' sampai Hal ' + nomorTerakhir + ' (' + dicek + ' halaman) tidak ada tombol Simpan lagi.');
        }
    }

    function tampilkanPesanCek(judulTeks, infoTeks, error) {
        const lama = document.getElementById('cekSimpanModal');
        if (lama) lama.remove();

        const overlay = document.createElement('div');
        overlay.id = 'cekSimpanModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;justify-content:center;align-items:center;padding:16px;box-sizing:border-box;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,.3);width:min(420px,100%);display:flex;flex-direction:column;padding:20px;box-sizing:border-box;text-align:center;';

        const judul = document.createElement('p');
        judul.style.cssText = 'font-size:16px;font-weight:bold;color:#333;margin:0 0 8px;';
        judul.textContent = judulTeks;

        const info = document.createElement('p');
        info.style.cssText = 'font-size:13px;margin:0 0 16px;color:' + (error ? '#dc3545' : '#666') + ';';
        info.textContent = infoTeks;

        const ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = 'OK';
        ok.className = 'btn btn-success';
        ok.style.cssText = 'align-self:center;padding:8px 25px;font-size:14px;background:#28a745;color:#fff;border:none;border-radius:4px;cursor:pointer;';
        ok.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        box.appendChild(judul);
        box.appendChild(info);
        box.appendChild(ok);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function initControls() {
        if (document.getElementById('autoKoreksiGroup')) return;

        injectResponsiveStyle();

        const targetBtn = findFifoBtn();

        if (targetBtn) {
            const groupDiv = document.createElement('div');
            groupDiv.id = 'autoKoreksiGroup';

            const startBtn = document.createElement('button');
            startBtn.id = 'startAutoBtn';
            startBtn.type = 'button';
            startBtn.className = targetBtn.className ? targetBtn.className : 'btn btn-default';
            startBtn.textContent = isRunning ? 'KOREKSI...' : 'START AUTO';
            startBtn.style.backgroundColor = '#28a745';
            startBtn.style.color = '#fff';
            startBtn.style.borderColor = '#28a745';
            startBtn.style.minWidth = '130px';
            startBtn.style.textAlign = 'center';

            const stopBtn = document.createElement('button');
            stopBtn.id = 'stopAutoBtn';
            stopBtn.type = 'button';
            stopBtn.className = targetBtn.className ? targetBtn.className : 'btn btn-default';
            stopBtn.textContent = 'STOP';
            stopBtn.style.backgroundColor = '#dc3545';
            stopBtn.style.color = '#fff';
            stopBtn.style.borderColor = '#dc3545';
            stopBtn.style.minWidth = '70px';

            startBtn.addEventListener('click', function() {
                if (!isRunning && !cekJalan) {
                    if (!simpanIsianManual()) return;
                    tandaiAutoMulai();
                    mulaiAlur(startBtn);
                }
            });

            stopBtn.addEventListener('click', function() {
                sessionStorage.setItem('erzap_auto_running', 'false');
                isRunning = false;
                alurAktif = false;
                cekDibatalkan = true;
                startBtn.textContent = 'START AUTO';
                startBtn.style.backgroundColor = '#28a745';
                let finalLogs = JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}');
                showPaginatedSummaryPopup('Proses Auto Koreksi dihentikan.', finalLogs);
            });

            const cekBtn = document.createElement('button');
            cekBtn.id = 'cekSimpanBtn';
            cekBtn.type = 'button';
            cekBtn.className = targetBtn.className ? targetBtn.className : 'btn btn-default';
            cekBtn.textContent = 'CEK SIMPAN';
            cekBtn.title = 'Lewati halaman yang sudah tidak ada tombol Simpan, pindah ke halaman berikutnya yang masih ada, lalu langsung isi & simpan';
            cekBtn.style.backgroundColor = '#fd7e14';
            cekBtn.style.color = '#fff';
            cekBtn.style.borderColor = '#fd7e14';
            cekBtn.style.minWidth = '110px';
            cekBtn.addEventListener('click', function() {
                if (isRunning || cekJalan) return;
                cariHalamanBelumSimpan(cekBtn);
            });

            groupDiv.appendChild(startBtn);
            groupDiv.appendChild(cekBtn);
            groupDiv.appendChild(stopBtn);
            targetBtn.parentNode.insertBefore(groupDiv, targetBtn);

            syncSizeWithFifo();
            // FIFO kadang baru "settle" ke ukuran finalnya sesaat setelah insert
            // (font/CSS eksternal, dsb) -> sinkronkan ulang beberapa kali.
            setTimeout(syncSizeWithFifo, 300);
            setTimeout(syncSizeWithFifo, 1000);
            setTimeout(syncSizeWithFifo, 2500);
            window.addEventListener('resize', syncSizeWithFifo);

            if (isRunning) {
                saatHalamanSiap(() => mulaiAlur(startBtn));
            }
        }
    }

    // Resume secepatnya: begitu halaman selesai load (handler datepicker dll sudah
    // terpasang), bukan jeda tetap. Tapi jangan sampai tertahan menunggu 'load' kalau
    // ada resource lambat (gambar/widget) -- maks 1,5 detik, sama seperti versi lama.
    // Tabel yang belum siap tetap ditunggu di runAutoProcess.
    function saatHalamanSiap(fn) {
        let sudah = false;
        const jalan = () => { if (!sudah) { sudah = true; fn(); } };
        if (document.readyState === 'complete') { setTimeout(jalan, 200); return; }
        window.addEventListener('load', () => setTimeout(jalan, 200));
        setTimeout(jalan, 1500);
    }

    function runAutoProcess(btnElement, coba) {
        coba = coba || 0;
        if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;

        let currentP = getCurrentPageNumber();
        let storedMax = parseInt(sessionStorage.getItem('erzap_max_page') || '1');
        if (currentP > storedMax) {
            sessionStorage.setItem('erzap_max_page', currentP);
        }

        // --- TAHAP 1: KOREKSI ---
        if (btnElement) {
            btnElement.textContent = 'KOREKSI...';
            btnElement.style.backgroundColor = '#28a745';
            btnElement.style.borderColor = '#28a745';
        }

        setTimeout(function() {
            if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;

            // Tabel siap = ada input koreksi dan belum ada yang bertanda data-aistim-done.
            // Tanda itu dipasang setelah tabel diisi, jadi tabel yang sudah diproses
            // tidak akan pernah diisi & disimpan ulang. Kalau belum siap (tabel belum
            // ke-render / halaman belum berganti), tunggu dulu maks ~5 detik (cek tiap ~0,2 dtk).
            const adaInput = document.querySelectorAll(KOREKSI_SELECTOR).length > 0;
            const sudahDiproses = !!document.querySelector(KOREKSI_SELECTOR + '[data-aistim-done]');

            // Halaman tanpa tombol Simpan = sudah tersimpan -> lewati, JANGAN simpan ulang.
            // Ditunggu ~1 detik dulu (10 x 100ms), siapa tahu tombolnya baru dirender.
            if (!sudahDiproses && !tombolSimpanTampil()) {
                if (coba < 10) {
                    setTimeout(() => runAutoProcess(btnElement, coba + 1), 100);
                    return;
                }
                // Tandai input-nya juga, supaya tungguHalamanBaru tidak mengira halaman
                // ini "tabel baru" lalu memprosesnya lagi.
                document.querySelectorAll(KOREKSI_SELECTOR).forEach(inp => inp.setAttribute('data-aistim-done', '1'));
                // Kalau halaman ini tadi kita simpan lalu Erzap memuat ulang halamannya,
                // hilangnya tombol Simpan = bukti simpannya berhasil.
                const statusLama = JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}')[currentP];
                catatStatus(currentP, (statusLama === 'Tidak Pasti' || statusLama === 'Berhasil') ? 'Berhasil' : 'Sudah tersimpan');
                if (btnElement) {
                    btnElement.textContent = 'SKIP...';
                    btnElement.style.backgroundColor = '#6c757d';
                    btnElement.style.borderColor = '#6c757d';
                }
                console.log('[Aistim] Koreksi: Hal ' + currentP + ' tidak ada tombol Simpan -> sudah tersimpan, dilewati');
                lanjutHalamanBerikutnya();
                return;
            }

            if ((!adaInput || sudahDiproses) && coba < 25) {
                setTimeout(() => runAutoProcess(btnElement, coba + 1), 100);
                return;
            }
            if (sudahDiproses) {
                console.warn('[Aistim] Koreksi: tabel masih bertanda data-aistim-done setelah ~5 detik');
                berhentiDenganRangkuman(btnElement, 'Halaman tidak berganti (tabel masih yang lama). Proses dihentikan agar tidak tersimpan dua kali.');
                return;
            }

            // 1 & 2. Pengkoreksi & Tanggal Koreksi: pakai isian MANUAL user (disimpan saat
            //        START / CEK SIMPAN, lihat simpanIsianManual) supaya tiap halaman sama.
            //        Tanggal dipakai persis seperti yang diketik/dipilih user, jadi formatnya
            //        otomatis cocok dengan field-nya.
            //
            //        Field yang isinya sudah sama TIDAK disentuh (halaman tempat user mengisi).
            //        Sengaja tanpa event focus/blur/keyup: datepicker Erzap membaca ulang
            //        field saat event itu dan bisa mereset tanggal ke hari ini.
            function isiField(inp, val) {
                if (inp.value.trim() === val) return;
                inp.value = val;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
            let isian = {};
            try { isian = JSON.parse(sessionStorage.getItem('erzap_isian_manual') || '{}'); } catch (e) {}
            const pengkoreksiInput = document.getElementById('stok_opnam_pengkoreksi');
            const tanggalKoreksiInput = document.getElementById('stok_opnam_tanggal_koreksi');
            function pastikanIsianManual() {
                if (pengkoreksiInput && isian.pengkoreksi) isiField(pengkoreksiInput, isian.pengkoreksi);
                if (tanggalKoreksiInput && isian.tanggal) isiField(tanggalKoreksiInput, isian.tanggal);
            }
            pastikanIsianManual();

            // 3. Isi input jumlah koreksi per produk:
            //    - Input PALING ATAS dalam grup produk = nilai Hasil SO
            //    - Input ke-2, ke-3, dst dalam grup yang sama = 0
            const koreksiSelector = KOREKSI_SELECTOR;
            const processedInputs = new Set();
            let lastKoreksiInput = null;

            function setInputValue(inp, val) {
                if (processedInputs.has(inp)) return;
                processedInputs.add(inp);
                inp.value = val;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                lastKoreksiInput = inp;
            }

            const soCells = document.querySelectorAll('td[id^="so"]');
            soCells.forEach(soCell => {
                // Ambil angka Hasil SO (dukung minus & koma, mis. "-1,5" / "12.000")
                let valText = soCell.textContent.trim();
                const match = valText.match(/-?[\d.,]+/);
                let hasilSOVal = match ? match[0] : '0';

                let currentRow = soCell.closest('tr');
                if (!currentRow) return;

                // Jumlah baris yang dicakup produk ini diambil dari atribut rowspan
                // pada kolom Hasil SO (lebih andal daripada menebak id <tr>).
                let span = parseInt(soCell.getAttribute('rowspan') || '1', 10);
                if (isNaN(span) || span < 1) span = 1;

                let inputsInGroup = [];
                let row = currentRow;
                let rowsChecked = 0;
                while (row && rowsChecked < span) {
                    let inps = row.querySelectorAll(koreksiSelector);
                    inps.forEach(i => { if (!processedInputs.has(i)) inputsInGroup.push(i); });
                    row = row.nextElementSibling;
                    rowsChecked++;
                }

                // Fallback: jika rowspan tidak dipakai, gabungkan baris-baris berikutnya
                // selama baris tersebut TIDAK punya cell Hasil SO sendiri (berarti masih
                // produk yang sama / baris lanjutan).
                if (span === 1) {
                    let sib = currentRow.nextElementSibling;
                    while (sib && !sib.querySelector('td[id^="so"]')) {
                        let inps = sib.querySelectorAll(koreksiSelector);
                        if (inps.length === 0) break;
                        inps.forEach(i => { if (!processedInputs.has(i)) inputsInGroup.push(i); });
                        sib = sib.nextElementSibling;
                    }
                }

                // Isi nilai: index 0 (paling atas) = Hasil SO, sisanya = 0
                inputsInGroup.forEach((inp, idx) => {
                    setInputValue(inp, idx === 0 ? hasilSOVal : '0');
                });
            });

            // Fallback terakhir: input koreksi yang tidak masuk grup mana pun
            // (mis. struktur tabel tak terduga) -> isi 0 agar tidak ikut terkirim
            // dengan nilai lama/kosong.
            document.querySelectorAll(koreksiSelector).forEach(inp => {
                if (!processedInputs.has(inp)) {
                    setInputValue(inp, '0');
                }
            });

            // Tandai tabel ini sudah diproses (lihat cek "tabel siap" di atas)
            document.querySelectorAll(koreksiSelector).forEach(inp => inp.setAttribute('data-aistim-done', '1'));

            // --- TAHAP 2: SIMPAN (Enter di input koreksi terakhir) ---
            setTimeout(function() {
                if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;

                const divSimpan = document.getElementById('simpan');

                // Tanpa input koreksi jangan pernah tekan Simpan (form kosong) -> lewati halaman
                if (!lastKoreksiInput) {
                    catatStatus(currentP, 'Dilewati (tabel kosong)');
                    if (btnElement) {
                        btnElement.textContent = 'SKIP...';
                        btnElement.style.backgroundColor = '#6c757d';
                        btnElement.style.borderColor = '#6c757d';
                    }
                    lanjutHalamanBerikutnya();
                    return;
                }

                if (btnElement) {
                    btnElement.textContent = 'SIMPAN...';
                    btnElement.style.backgroundColor = '#007bff';
                    btnElement.style.borderColor = '#007bff';
                }
                // Dicatat "Tidak Pasti" dulu; baru jadi "Berhasil" setelah simpan
                // benar-benar terpantau selesai (lihat tungguSimpanSelesai).
                catatStatus(currentP, 'Tidak Pasti');

                // Kalau datepicker sempat mengubah tanggal setelah diisi, kembalikan ke isian user
                pastikanIsianManual();

                function selesai(status) {
                    catatStatus(currentP, status);
                    lanjutHalamanBerikutnya();
                }

                pasangDetektorSimpan();
                simpanTerdeteksi = false;
                simpanError = false;
                requestAktif = 0;
                // Simpan bisa membuat Erzap memuat ulang halaman ini -> titip tanda
                // supaya proses tetap lanjut di halaman hasil muat ulang itu.
                tandaiLanjutOlehScript();
                tekanEnter(lastKoreksiInput);

                // Enter belum tentu nyangkut di semua halaman. Kalau dalam 400ms gak ada
                // tanda simpan jalan, baru pakai cara tombol. Dicek tiap 50ms supaya simpan
                // yang selesai cepat pun tetap kedeteksi dan gak jadi kesimpan dua kali.
                let nunggu = 0;
                (function cekSimpanMulai() {
                    if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;
                    if (simpanTerdeteksi || sedangMenyimpan()) { tungguSimpanSelesai(selesai); return; }

                    nunggu += 50;
                    if (nunggu < 400) { setTimeout(cekSimpanMulai, 50); return; }

                    // @world main -> fungsi simpan milik halaman bisa dipanggil langsung
                    tandaiLanjutOlehScript();
                    if (typeof submit_form_koreksi_so === 'function') submit_form_koreksi_so();
                    else if (divSimpan) divSimpan.click();
                    tungguSimpanSelesai(selesai);
                })();

            }, 150);

        }, 100);
    }

    // Tunggu sampai Erzap selesai memproses simpan, bukan nebak pakai jeda tetap.
    // Ini yang bikin siklusnya cepat tapi tetap aman: lanjut begitu simpan beres,
    // dan gak pernah pindah halaman selagi request simpan masih jalan.
    // Status yang dikirim ke cb:
    // - 'Berhasil'    : simpan terpantau jalan lalu selesai tanpa error AJAX
    // - 'Gagal Save'  : request simpan balik dengan error
    // - 'Tidak Pasti' : simpan tidak terpantau sama sekali, atau lewat 8 detik belum selesai
    // Kalau simpan belum terlihat mulai, ditunggu dulu sampai 1,5 detik (klik tombol
    // Simpan bisa baru memicu request sesaat kemudian) supaya tidak pindah halaman
    // di tengah simpan.
    function tungguSimpanSelesai(cb) {
        let nunggu = 0;
        let terlihat = false;
        (function cek() {
            if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;
            const jalan = simpanSedangJalan();
            if (jalan || simpanTerdeteksi) terlihat = true;

            let status = null;
            if (jalan) { if (nunggu >= 8000) status = 'Tidak Pasti'; }
            else if (terlihat) status = simpanError ? 'Gagal Save' : 'Berhasil';
            else if (nunggu >= 1500) status = 'Tidak Pasti';

            if (status) { setTimeout(() => cb(status), 50); return; }
            nunggu += 100;
            setTimeout(cek, 100);
        })();
    }

    function berhentiDenganRangkuman(btnElement, pesan) {
        sessionStorage.setItem('erzap_auto_running', 'false');
        isRunning = false;
        alurAktif = false;
        if (btnElement) {
            btnElement.textContent = 'SELESAI';
            btnElement.style.backgroundColor = '#17a2b8';
            btnElement.style.borderColor = '#17a2b8';
        }
        const finalLogs = JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}');
        showPaginatedSummaryPopup(pesan, finalLogs);
    }

    // Cari link "halaman berikutnya". Dicari di area pagination dulu; kalau tidak
    // ketemu, baru ke seluruh halaman KECUALI menu/header/breadcrumb/sidebar --
    // supaya link menu yang kebetulan pakai '›' atau '»' tidak ikut terklik.
    //
    // root = dokumen yang dicari (default halaman ini). cekTampil=false untuk dokumen
    // hasil fetch, yang tidak dirender sehingga offsetParent selalu null.
    // arah = 'next' (default) atau 'prev' (halaman sebelumnya).
    function cariLinkBerikutnya(root, cekTampil, arah) {
        root = root || document;
        if (cekTampil === undefined) cekTampil = true;
        const mundur = arah === 'prev';
        function bisaDiklik(a) {
            if (cekTampil && a.offsetParent === null) return false;
            // Link ke halaman yang sedang dibuka (mis. "Akhir »" di halaman terakhir)
            // bukan halaman berikutnya -- kalau diklik, prosesnya muter di halaman yang sama.
            if (root === document && bersihkanUrl(a.getAttribute('href'), location.href) === bersihkanUrl(location.href, location.href)) return false;
            if (a.classList.contains('disabled') || a.getAttribute('aria-disabled') === 'true') return false;
            const p = a.parentElement;
            return !(p && p.classList.contains('disabled'));
        }
        // Prioritas: rel="next" > teks Selanjutnya/Berikutnya/Next > '›' > '»'
        // (mundur: rel="prev" > Sebelumnya/Prev > '‹' > '«')
        function skor(a) {
            if ((a.getAttribute('rel') || '').split(/\s+/).indexOf(mundur ? 'prev' : 'next') !== -1) return 4;
            const t = a.textContent.trim();
            // "« Awal" / "Akhir »" / "First" / "Last" = lompat ke ujung, bukan satu halaman
            if (/\b(awal|akhir|pertama|terakhir|first|last)\b/i.test(t)) return 0;
            const kata = t.replace(/^[«‹\s]+/, '');
            if (mundur ? /^(sebelumnya|prev|previous)\b/i.test(kata) : /^(selanjutnya|berikutnya|next)\b/i.test(t)) return 3;
            if (t.includes(mundur ? '‹' : '›')) return 2;
            if (t.includes(mundur ? '«' : '»')) return 1;
            return 0;
        }
        function pilih(links, skorMin) {
            let terbaik = null, nilai = 0;
            links.forEach(a => {
                const s = skor(a);
                if (s >= skorMin && s > nilai && bisaDiklik(a)) { terbaik = a; nilai = s; }
            });
            return terbaik;
        }
        const bukanMenu = Array.from(root.querySelectorAll('a')).filter(a =>
            !a.closest('nav, header, .navbar, .breadcrumb, .sidebar, .main-sidebar, .dropdown-menu, .treeview-menu'));
        return pilih(root.querySelectorAll('.pagination a, [class*="paginat"] a'), 1)
            || pilih(bukanMenu, 1);
    }

    // Setelah klik "berikutnya": kalau halaman reload penuh, dokumen ini akan hilang
    // dan script di halaman baru yang melanjutkan (lihat initControls). Selama halaman
    // lama masih tampil, JANGAN proses apa-apa -- dulu di sini ada timer tetap 1,2 detik
    // yang memproses ulang halaman lama kalau server lambat -> tersimpan dua kali.
    // Kalau ternyata pagination-nya AJAX (dokumen tetap), lanjut begitu halaman berganti.
    function tungguHalamanBaru(linkLama) {
        let nunggu = 0;
        (function cek() {
            if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;
            const tabelBaru = document.querySelectorAll(KOREKSI_SELECTOR).length > 0 &&
                !document.querySelector(KOREKSI_SELECTOR + '[data-aistim-done]');
            if (!linkLama.isConnected || tabelBaru) {
                setTimeout(() => runAutoProcess(document.getElementById('startAutoBtn')), 300);
                return;
            }
            nunggu += 150;
            if (nunggu >= 60000) {
                berhentiDenganRangkuman(document.getElementById('startAutoBtn'),
                    'Halaman berikutnya tidak termuat dalam 60 detik. Proses dihentikan.');
                return;
            }
            setTimeout(cek, 150);
        })();
    }

    // Cek akhir: baca ulang semua halaman dari halaman ini mundur sampai halaman 1
    // (lewat link "sebelumnya"), catat halaman yang masih ada tombol Simpan.
    // Halaman ini ikut dibaca ulang dari server, karena tombol Simpan-nya baru hilang
    // setelah halaman dimuat ulang.
    async function cekAkhirSO(btnElement) {
        let url = bersihkanUrl(location.href, location.href);
        const dikunjungi = new Set();
        const nomorDibaca = new Set();
        const belum = [];
        let dicek = 0;
        let error = '';
        try {
            while (url && !dikunjungi.has(url) && dikunjungi.size < 500) {
                if (sessionStorage.getItem('erzap_auto_running') !== 'true') { error = 'Dihentikan'; break; }
                dikunjungi.add(url);
                if (btnElement) btnElement.textContent = 'CEK AKHIR ' + (dicek + 1) + '...';
                const hal = await bacaHalaman(url);
                if (hal.nomor !== null) {
                    if (nomorDibaca.has(hal.nomor)) break;
                    nomorDibaca.add(hal.nomor);
                }
                dicek++;
                if (hal.simpan) belum.push(hal.nomor !== null ? hal.nomor : '?');
                url = hal.prev;
            }
        } catch (e) {
            error = String(e && e.message || e);
            console.error('[Aistim] Cek akhir SO gagal:', e);
        }
        belum.sort((a, b) => (a === '?' ? 1e9 : a) - (b === '?' ? 1e9 : b));
        return { belum, dicek, error };
    }

    async function selesaiSO(btnElement) {
        if (btnElement) {
            btnElement.textContent = 'CEK AKHIR...';
            btnElement.style.backgroundColor = '#17a2b8';
            btnElement.style.borderColor = '#17a2b8';
        }
        const hasil = await cekAkhirSO(btnElement);
        if (sessionStorage.getItem('erzap_auto_running') !== 'true') return; // STOP ditekan saat cek akhir

        let pesan;
        if (hasil.error) {
            pesan = 'Proses selesai, tapi cek akhir gagal (' + hasil.error + '). Klik CEK SIMPAN dari halaman 1 untuk memastikan.';
        } else if (!hasil.belum.length) {
            pesan = '✅ SO SELESAI — semua ' + hasil.dicek + ' halaman sudah tersimpan.';
        } else {
            pesan = '⚠️ Belum selesai: ' + hasil.belum.length + ' halaman masih ada tombol Simpan (Hal ' +
                hasil.belum.join(', ') + '). Klik CEK SIMPAN untuk melanjutkan.';
        }
        console.log('[Aistim] Koreksi selesai:', pesan);

        // SO selesai -> refresh halaman supaya tampilan Erzap menunjukkan data terbaru.
        // Rangkuman dititipkan ke sessionStorage lalu ditampilkan setelah refresh
        // (lihat tampilkanRangkumanTertunda), supaya tidak ikut hilang.
        sessionStorage.setItem('erzap_auto_running', 'false');
        isRunning = false;
        alurAktif = false;
        sessionStorage.setItem('erzap_rangkuman_tertunda', JSON.stringify({
            pesan: pesan,
            logs: JSON.parse(sessionStorage.getItem('erzap_page_logs') || '{}')
        }));
        if (btnElement) btnElement.textContent = 'REFRESH...';
        location.reload();
    }

    function tampilkanRangkumanTertunda() {
        const raw = sessionStorage.getItem('erzap_rangkuman_tertunda');
        if (!raw) return;
        sessionStorage.removeItem('erzap_rangkuman_tertunda');
        try {
            const r = JSON.parse(raw);
            showPaginatedSummaryPopup(r.pesan, r.logs || {});
        } catch (e) {}
    }

    // --- TAHAP 3: RELOAD / PINDAH HALAMAN BERIKUTNYA ---
    function lanjutHalamanBerikutnya() {
        if (sessionStorage.getItem('erzap_auto_running') !== 'true') return;

        const btnElement = document.getElementById('startAutoBtn');
        if (btnElement) {
            btnElement.textContent = 'RELOAD...';
            btnElement.style.backgroundColor = '#ffc107';
            btnElement.style.borderColor = '#ffc107';
        }

        const nextLink = cariLinkBerikutnya();
        console.log('[Aistim] Koreksi: link berikutnya =', nextLink ? nextLink.outerHTML : '(tidak ketemu -> selesai)');
        if (nextLink) {
            tandaiLanjutOlehScript();
            nextLink.click();
            tungguHalamanBaru(nextLink);
        } else {
            selesaiSO(btnElement);
        }
    }

    // Pasang tombol langsung (DOM sudah siap saat script diinject); panggilan ulang
    // setelah load tetap ada untuk halaman yang merender tombol FIFO belakangan.
    initControls();
    tampilkanRangkumanTertunda();
    window.addEventListener('load', function() {
        setTimeout(initControls, 1200);
    });

    let syncScheduled = false;
    const observer = new MutationObserver(function() {
        if (!document.getElementById('autoKoreksiGroup')) {
            initControls();
        } else if (!syncScheduled) {
            // Throttle: cukup 1x per animation frame meski banyak mutation beruntun
            syncScheduled = true;
            requestAnimationFrame(function() {
                syncScheduled = false;
                syncSizeWithFifo();
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
