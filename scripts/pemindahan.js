// ==UserScript==
// @name         Erzap - Lihat Data Barang (Pemindahan Barang)
// @namespace    http://tampermonkey.net/
// @version      1.10.0
// @description  Tambah tombol "Log Data Pemindahan" di atas tabel Daftar Barang - tampilkan Barcode, Jumlah Transfer, Keterangan dari halaman ini atau dari kode/ID/link Pemindahan Barang lain, lalu bisa langsung dimasukkan (copy field) ke tabel di halaman ini. Dari/Ke Outlet & Gudang diisi dari pengaturan yang disimpan user (pertama kali pilih manual di form lalu Simpan), dicek ulang lewat konfirmasi sebelum Masukkan ke Tabel. Tombol "Data Pembelian" mengambil daftar barang dengan cara yang sama dari Faktur Pembelian (No Faktur atau link /faktur_pembelians/<ID>).
// @author       You
// @match        https://*.erzap.com/pemindahan_barangs*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// @world        main
// ==/UserScript==

(function () {
    'use strict';

    var STYLE = [
        '#bt_lihat_barang, #bt_pembelian{cursor:pointer;}',
        '#overlay_modal_umum{display:none;position:fixed;top:0;left:0;width:100%;height:100%;',
        'background:rgba(0,0,0,0.5);z-index:99998;}',
        '.mib_modal{display:none;position:fixed;top:50%;left:50%;',
        'transform:translate(-50%,-50%);background:#fff;border-radius:6px;',
        'box-shadow:0 4px 24px rgba(220,38,38,0.55);max-width:95vw;max-height:90vh;',
        'flex-direction:column;overflow:hidden;',
        'z-index:99999;font-family:Arial, sans-serif;}',
        '#modal_lihat_barang{width:560px;max-width:min(560px, 95vw);}',
        '.mib_modal .mib_header{flex:0 0 auto;padding:12px 16px;border-bottom:1px solid #eee;',
        'box-shadow:0 2px 8px rgba(220,38,38,0.5);',
        'font-weight:bold;font-size:15px;display:flex;justify-content:space-between;',
        'align-items:center;}',
        '.mib_modal .mib_close{cursor:pointer;color:#999;font-size:18px;line-height:1;}',
        '.mib_modal .mib_close:hover{color:#333;}',
        '.mib_modal .mib_body{flex:1 1 auto;min-height:0;overflow-y:auto;',
        '-webkit-overflow-scrolling:touch;padding:16px;}',
        '.mib_modal .mib_body p{margin:0 0 8px;font-size:12px;color:#666;}',
        '.mib_modal textarea, .mib_modal input[type="text"]{width:100%;box-sizing:border-box;',
        'font-family:Consolas, monospace;font-size:13px;padding:8px;',
        'border:1px solid #ccc;border-radius:4px;}',
        '.mib_modal textarea{height:180px;resize:vertical;}',
        '.mib_modal .mib_progress{margin-top:8px;font-size:12px;color:#0d6efd;display:none;}',
        '#llb_status{margin-top:8px;font-size:12px;color:#0d6efd;min-height:14px;}',
        '#llb_header{margin-top:8px;font-size:12px;color:#333;background:#f8f9fa;',
        'border:1px solid #eee;border-radius:4px;padding:8px;overflow-x:auto;}',
        '#llb_header div{margin-bottom:2px;white-space:nowrap;}',
        '#llb_btn_simpan_header{margin-top:6px;padding:4px 10px;font-size:12px;',
        'border-radius:4px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;}',
        '#llb_btn_simpan_header:disabled{opacity:0.6;cursor:not-allowed;}',
        '#llb_hasil{margin-top:12px;max-height:320px;overflow:auto;',
        '-webkit-overflow-scrolling:touch;}',
        // Header tabel menempel di atas area scroll (#llb_hasil). Garis tabel dibuat dengan
        // border-collapse:separate - kalau collapse, garis header ikut terscroll walau latarnya menempel.
        '.llb_table{width:100%;min-width:420px;border-collapse:separate;border-spacing:0;font-size:13px;}',
        '.llb_table th, .llb_table td{border-right:1px solid #ddd;border-bottom:1px solid #ddd;',
        'padding:6px 8px;text-align:left;white-space:nowrap;}',
        '.llb_table th:first-child, .llb_table td:first-child{border-left:1px solid #ddd;}',
        '.llb_table th{background:#f5f5f5;border-top:1px solid #ddd;position:sticky;top:0;z-index:1;}',
        '#llb_ringkasan{margin-top:12px;font-size:13px;color:#333;}',
        '#llb_ringkasan:empty{display:none;}',
        '#llb_ringkasan:not(:empty) + #llb_hasil{margin-top:6px;}',
        '.mib_modal .mib_footer{flex:0 0 auto;padding:12px 16px;border-top:1px solid #eee;',
        'text-align:right;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;}',
        '.mib_modal .mib_footer button{padding:6px 14px;',
        'border-radius:4px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;',
        'font-size:13px;}',
        '.mib_modal .mib_footer button.mib_primary{background:#dc2626;',
        'border-color:#dc2626;color:#fff;}',
        '.mib_modal .mib_footer button:disabled{opacity:0.6;cursor:not-allowed;}',
        '@media (max-width:480px){',
        '.mib_modal{width:95vw !important;max-width:95vw !important;}',
        '.mib_modal .mib_footer{justify-content:stretch;}',
        '.mib_modal .mib_footer button{flex:1 1 auto;margin-left:0;}',
        '}',
        // Scrollbar tipis, transparan, baru muncul warna merahnya saat area-nya di-hover.
        '.mib_modal .mib_body, #llb_hasil, #llb_header{',
        'scrollbar-width:thin;scrollbar-color:transparent transparent;}',
        '.mib_modal .mib_body:hover, #llb_hasil:hover, #llb_header:hover{',
        'scrollbar-color:#dc2626 transparent;}',
        '.mib_modal .mib_body::-webkit-scrollbar, #llb_hasil::-webkit-scrollbar,',
        '#llb_header::-webkit-scrollbar{width:6px;height:6px;}',
        '.mib_modal .mib_body::-webkit-scrollbar-track, #llb_hasil::-webkit-scrollbar-track,',
        '#llb_header::-webkit-scrollbar-track{background:transparent;}',
        '.mib_modal .mib_body::-webkit-scrollbar-thumb, #llb_hasil::-webkit-scrollbar-thumb,',
        '#llb_header::-webkit-scrollbar-thumb{background:transparent;border-radius:3px;}',
        '.mib_modal .mib_body:hover::-webkit-scrollbar-thumb,',
        '#llb_hasil:hover::-webkit-scrollbar-thumb,',
        '#llb_header:hover::-webkit-scrollbar-thumb{background:#dc2626;}',
        // Dialog di dalam halaman (pengganti alert/confirm bawaan browser)
        '#llb_dialog{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;',
        'background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:16px;',
        'box-sizing:border-box;font-family:Arial, sans-serif;}',
        '#llb_dialog .llb_dialog_kotak{background:#fff;border-radius:8px;border-top:4px solid #dc2626;',
        'box-shadow:0 4px 24px rgba(0,0,0,0.35);width:420px;max-width:100%;max-height:90vh;',
        'overflow-y:auto;padding:16px;box-sizing:border-box;}',
        '#llb_dialog_judul{font-weight:bold;font-size:16px;margin-bottom:10px;}',
        '#llb_dialog_isi{font-size:13px;color:#333;}',
        '#llb_dialog_isi p{margin:0 0 8px;}',
        '#llb_dialog_isi ul{margin:0 0 8px;padding-left:20px;}',
        '.llb_dialog_tabel{width:100%;border-collapse:collapse;margin:4px 0 10px;font-size:13px;}',
        '.llb_dialog_tabel td{border:1px solid #eee;padding:6px 8px;vertical-align:top;}',
        '.llb_dialog_tabel td:first-child{color:#666;white-space:nowrap;width:1%;}',
        '.llb_dialog_awas{background:#fdecea;color:#b91c1c;border-radius:4px;padding:8px;',
        'margin:0 0 8px;font-weight:bold;}',
        '.llb_dialog_kecil{font-size:12px;color:#666;}',
        '#llb_dialog .llb_dialog_tombol{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;}',
        '#llb_dialog .llb_dialog_tombol button{padding:8px 14px;border-radius:4px;border:1px solid #ccc;',
        'background:#f5f5f5;cursor:pointer;font-size:14px;}',
        '#llb_dialog #llb_dialog_ya{background:#dc2626;border-color:#dc2626;color:#fff;font-weight:bold;}',
        '@media (max-width:480px){#llb_dialog .llb_dialog_tombol button{flex:1 1 auto;}}'
    ].join('');

    var MODAL_HTML =
        '<div id="overlay_modal_umum"></div>' +
        '<div id="modal_lihat_barang" class="mib_modal">' +
            '<div class="mib_header">' +
                '<span id="llb_judul">Log Data Pemindahan</span>' +
                '<span class="mib_close" id="llb_btn_close_x">&times;</span>' +
            '</div>' +
            '<div class="mib_body">' +
                '<p id="llb_petunjuk"></p>' +
                '<input type="text" id="llb_input_link">' +
                '<div id="llb_status"></div>' +
                '<div id="llb_header"></div>' +
                '<button type="button" id="llb_btn_simpan_header">Simpan</button>' +
                '<div id="llb_ringkasan"></div>' +
                '<div id="llb_hasil"></div>' +
                '<div class="mib_progress" id="llb_progress"></div>' +
            '</div>' +
            '<div class="mib_footer">' +
                '<button id="llb_btn_tutup">Tutup</button>' +
                '<button id="llb_btn_masukkan_v2">Masukkan ke Tabel</button>' +
                '<button id="llb_btn_tampilkan" class="mib_primary">Tampilkan</button>' +
            '</div>' +
        '</div>';

    // Modal yang sama dipakai dua tombol: 'barang' (Log Data Pemindahan, sumber = Pemindahan Barang)
    // dan 'pembelian' (Data Pembelian, sumber = Faktur Pembelian). Bedanya cuma teks petunjuk,
    // cara membentuk link, dan cara membaca baris barang dari halaman sumber.
    var PETUNJUK_BARANG =
        'Kosongkan untuk memakai halaman ini, atau masukkan <b>Kode</b> Pemindahan Barang lain ' +
        '(mis. <code>PG0926-21559</code>), ID-nya (mis. <code>404128</code>) atau link lengkapnya, lalu klik Tampilkan.';
    var PLACEHOLDER_BARANG = 'mis. PG0926-21559 / 404128 / link';
    var PETUNJUK_PEMBELIAN = 'Masukkan <b>No Faktur</b> Pembelian (mis. <code>J1026-68557</code>)';
    var PLACEHOLDER_PEMBELIAN = 'mis. J1026-68557 / 00999 / link';
    var mode_sumber = 'barang';

    var HTML_IDOUTLET_OWN ='pemindahan_barang_idoutlet_own '; // sesuai id yang dipakai fetch_produk_quick di halaman ini
    var HTML_IDGUDANG = 'pemindahan_barang_idgudang_asal';

    // Beberapa hal yang dipicu tombol Masukkan (ganti Outlet/Gudang, tambah_baris, dst)
    // ada yang bikin halaman auto-scroll sendiri (bukan dari kode kita, tidak kelihatan
    // dari mana). Daripada dilacak satu-satu, posisi scroll di-"kunci" saja selama proses
    // berjalan - kalau halaman bergeser, langsung dikembalikan ke posisi semula.
    var _scroll_lock_interval = null;
    function kunci_posisi_scroll() {
        var x = window.scrollX, y = window.scrollY;
        lepas_kunci_scroll();
        _scroll_lock_interval = setInterval(function () {
            if (window.scrollX !== x || window.scrollY !== y) {
                window.scrollTo(x, y);
            }
        }, 50);
    }
    function lepas_kunci_scroll() {
        if (_scroll_lock_interval) {
            clearInterval(_scroll_lock_interval);
            _scroll_lock_interval = null;
        }
    }

    function buka_modal(selector) {
        $('#overlay_modal_umum').show();
        // .show() jQuery defaultnya balik ke display:block, padahal modal ini
        // butuh display:flex (header/body/footer jadi flex-column supaya body-nya
        // yang scroll, bukan seluruh modal meluber ke luar layar).
        $(selector).css('display', 'flex');
    }

    function tutup_semua_modal() {
        tutup_dialog();
        $('#overlay_modal_umum').hide();
        $('.mib_modal').css('display', 'none');
    }

    function escape_html(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Simulasi tombol Enter yang sungguhan (bukan cuma panggil fetch_produk_quick
    // langsung) - soalnya di halaman ini ada logika lain (mengisi Stok Asal/Tujuan)
    // yang baru jalan kalau event Enter beneran terjadi, bukan cuma hasil akhirnya.
    // keyCode/which di-override manual karena constructor KeyboardEvent modern
    // tidak menerima nilai itu langsung (dianggap legacy/read-only oleh browser).
    function buat_event_enter(tipe) {
        var ev;
        try {
            ev = new KeyboardEvent(tipe, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
        } catch (e) {
            ev = document.createEvent('KeyboardEvent');
            ev.initKeyboardEvent(tipe, true, true, window, 'Enter', 0, false, false, false, false);
        }
        try {
            Object.defineProperty(ev, 'keyCode', { get: function () { return 13; } });
            Object.defineProperty(ev, 'which', { get: function () { return 13; } });
        } catch (e) {}
        return ev;
    }

    function simulasikan_enter_pada_input(selector) {
        var el = $(selector)[0];
        if (!el) {
            return;
        }
        el.dispatchEvent(buat_event_enter('keydown'));
        el.dispatchEvent(buat_event_enter('keyup'));
    }

    // Dipakai oleh "Masukkan ke Tabel" versi V1 (kode disimpan, tidak dipakai di UI
    // lagi) - dulunya juga dipakai tombol "Impor Barang" (paste textarea) yang sudah
    // dihapus atas permintaan. Cuma butuh daftar string "qty barcode" yang diumpankan
    // satu-satu lewat simulasi Enter di kolom scan.
    // Scan "qty barcode" satu per satu lewat kolom scan halaman ini, dengan KONFIRMASI per barang:
    // barang berikutnya baru dikirim setelah jumlah barcode ini di tabel benar-benar bertambah sebanyak
    // qty-nya (bukan sekadar menunggu loading hilang - di laptop lambat loading belum sempat muncul dan
    // barcode berikutnya menimpa kolom scan). Barang yang tidak bertambah dalam BATAS_MS dicatat gagal
    // (mis. ditolak Erzap: produk tidak ditemukan / stok kurang) lalu lanjut ke barang berikutnya.
    // on_selesai({ berhasil: [barcode], gagal: [barcode] })
    function jalankan_baris_qty_barcode(baris, progress_selector, on_selesai) {
        $(progress_selector).show();
        var idx = 0;
        var berhasil = [], gagal = [];
        var KIRIM_ULANG_MS = 4000;   // Enter tidak memicu apa pun selama ini: kirim ulang sekali
        var BATAS_MS = 10000;        // jumlah di tabel tidak bertambah selama ini (halaman diam) = gagal
        var BATAS_SIBUK_MS = 30000;  // batas mutlak satu barang (ajax macet)
        var JEDA_TENANG_MS = 300;    // setelah jumlah bertambah, tunggu halaman diam sejenak

        // Erzap sedang memproses: loading tampil atau masih ada ajax jQuery yang berjalan.
        function sibuk() {
            return $('#loading_body').is(':visible') || (($.active || 0) > 0);
        }
        // Jumlah ajax jQuery yang sudah dikirim halaman (naik = Enter memicu proses).
        var ajax_terkirim = 0;
        $(document).on('ajaxSend.llb_scan', function () { ajax_terkirim++; });

        var normal = function (t) { return $.trim(String(t || '')).toLowerCase(); };
        var angka = function (t) {
            var n = parseFloat(String(t || '').replace(/,/g, '.'));
            return isNaN(n) ? 0 : n;
        };
        // Total jumlah barcode ini di tabel Daftar Barang (Erzap bisa menambah ke baris yang ada atau
        // membuat baris baru: dijumlah semua). Baris tanpa angka jumlah dihitung 1.
        function total_di_tabel(barcode) {
            var kunci = normal(barcode), total = 0;
            $('.searching_produk_barcode').each(function () {
                if (normal(this.value) !== kunci) {
                    return;
                }
                var j = $.trim($(this).closest('tr').find('.jumlah_produk').val() || '');
                total += j === '' ? 1 : angka(j);
            });
            return total;
        }

        // teks = baris apa adanya ("qty barcode", dikirim ke kolom scan seperti diketik manual);
        // qty = angkanya, hanya untuk mengecek bertambahnya jumlah di tabel
        function kirim(teks, barcode, qty, ulang) {
            var awal = total_di_tabel(barcode);
            var ajax_awal = ajax_terkirim;
            var mulai = Date.now();
            var terakhir_sibuk = 0, cukup_sejak = 0;
            $('#term_produk_quick').val(teks);
            simulasikan_enter_pada_input('#term_produk_quick');
            var cek = setInterval(function () {
                var sekarang = Date.now();
                var lagi_sibuk = sibuk();
                if (lagi_sibuk) {
                    terakhir_sibuk = sekarang;
                }
                // Masuk: jumlah di tabel sudah bertambah sebanyak qty, lalu halaman diam sejenak.
                if (total_di_tabel(barcode) >= awal + qty - 1e-9) {
                    cukup_sejak = cukup_sejak || sekarang;
                    if (!lagi_sibuk && sekarang - Math.max(cukup_sejak, terakhir_sibuk) >= JEDA_TENANG_MS) {
                        clearInterval(cek);
                        berhasil.push(barcode);
                        proses_baris_berikutnya();
                    }
                    return;
                }
                var ada_aktivitas = terakhir_sibuk || ajax_terkirim > ajax_awal || total_di_tabel(barcode) !== awal;
                // Enter tidak memicu apa pun (halaman belum siap): kirim ulang sekali.
                if (!ada_aktivitas && !ulang && sekarang - mulai >= KIRIM_ULANG_MS) {
                    clearInterval(cek);
                    console.warn('[lihat-barang] Barcode tidak diproses, dikirim ulang:', barcode);
                    kirim(teks, barcode, qty, true);
                    return;
                }
                // Halaman sudah diam tapi jumlah tidak bertambah: dicatat gagal, lanjut barang berikutnya.
                var diam_sejak = Math.max(mulai, terakhir_sibuk);
                if ((!lagi_sibuk && sekarang - diam_sejak >= BATAS_MS) || sekarang - mulai >= BATAS_SIBUK_MS) {
                    clearInterval(cek);
                    console.warn('[lihat-barang] Barcode tidak masuk ke tabel:', barcode, '| jumlah di tabel', awal, '->', total_di_tabel(barcode), '(seharusnya +' + qty + ')');
                    gagal.push(barcode);
                    proses_baris_berikutnya();
                }
            }, 100);
        }

        function proses_baris_berikutnya() {
            if (idx >= baris.length) {
                $(document).off('ajaxSend.llb_scan');
                $(progress_selector).text('Selesai: ' + berhasil.length + ' dari ' + baris.length + ' baris masuk' +
                    (gagal.length ? ', ' + gagal.length + ' gagal.' : '.'));
                if (on_selesai) {
                    setTimeout(function () { on_selesai({ berhasil: berhasil, gagal: gagal }); }, 500);
                }
                return;
            }
            var teks = $.trim(baris[idx]);
            idx++;
            var m = /^(\S+)\s+(.+)$/.exec(teks);
            var qty = m ? angka(m[1]) : 0;
            var barcode = m ? $.trim(m[2]) : teks;
            $(progress_selector).text('Memproses baris ' + idx + ' dari ' + baris.length + ' (' + barcode + ')' +
                (gagal.length ? ' - ' + gagal.length + ' gagal' : '') + ' ...');
            kirim(teks, barcode, qty > 0 ? qty : 1, false);
        }

        // Jangan mulai selagi halaman masih memproses sesuatu (mis. ganti Outlet / Gudang barusan),
        // paling lama 10 detik (ajax lain yang lama jangan sampai menahan selamanya).
        var mulai_tunggu = Date.now();
        (function tunggu_diam() {
            if (sibuk() && Date.now() - mulai_tunggu < 10000) {
                setTimeout(tunggu_diam, 150);
                return;
            }
            proses_baris_berikutnya();
        })();
    }

    // ---------- Log Data Pemindahan (Barcode, Jumlah Transfer, Keterangan dari halaman ini atau link lain) ----------

    function ambil_data_baris(tr) {
        var $tr = $(tr);
        var barcode = $.trim($tr.find('.searching_produk_barcode').val() || $tr.find('.data_produk_barcode').val() || '');
        if (barcode === '') {
            return null; // baris kosong/template, dilewati
        }
        var jumlah = $tr.find('.jumlah_produk').val() || '';
        var $td_keterangan = $tr.find('td').last();
        var $input_keterangan = $td_keterangan.find('input, textarea');
        var keterangan = $input_keterangan.length > 0 ? $input_keterangan.val() : $.trim($td_keterangan.text());
        return { barcode: barcode, jumlah: jumlah, keterangan: keterangan };
    }

    // Field header (Dari Outlet/Gudang, Ke Outlet/Gudang) belum pernah kelihatan HTML aslinya
    // di sini, jadi dicari berdasarkan teks <label> yang tampil di layar - lebih tahan
    // dibanding menebak id, walau tidak 100% pasti kalau markup-nya di luar pola umum.
    var LABEL_HEADER = ['Dari Outlet', 'Dari Gudang', 'Ke Outlet', 'Ke Gudang'];

    function cari_field_by_label($root, label_text) {
        var $label = $root.find('label').filter(function () {
            return $.trim($(this).text()).replace(/\*/g, '') === label_text;
        }).first();
        if ($label.length === 0) {
            return $();
        }
        var $container = $label.closest('.field');
        if ($container.length === 0) {
            $container = $label.parent();
        }
        var $field = $container.find('select, input[type="text"], input[type="hidden"]').first();
        if ($field.length === 0) {
            $field = $label.nextAll('select, input').first();
        }
        return $field;
    }

    // Catatan: tidak dipanggil dari mana pun (Dari/Ke Outlet & Gudang sekarang dari
    // pengaturan tersimpan user) - disimpan kalau-kalau nanti mau balik ke perilaku
    // "ambil header asli dari halaman/link yang di-fetch".
    function ambil_header_dari_wrap($wrap) {
        var header = {};
        LABEL_HEADER.forEach(function (label) {
            var $field = cari_field_by_label($wrap, label);
            var teks = '';
            if ($field.length > 0) {
                if ($field.is('select')) {
                    // Opsi placeholder ("Please select" dsb) biasanya value="" - kalau
                    // masih di situ berarti belum benar-benar dipilih, jangan dianggap
                    // sebagai nilai asli (nanti malah bisa menimpa pilihan yang sudah
                    // benar di form tujuan dengan "Please select").
                    if ($field.val()) {
                        teks = $.trim($field.find('option:selected').text());
                    }
                } else {
                    teks = $.trim($field.val() || '');
                }
            }
            header[label] = teks;
        });
        return header;
    }

    // ---------- Pengaturan Dari/Ke Outlet & Gudang (disimpan user, bukan hardcode) ----------
    // Pertama kali: pilih Dari Outlet, Dari Gudang, Ke Outlet & Ke Gudang MANUAL di form
    // halaman ini, lalu klik "Simpan dari Form" di modal. Nilai itu dipakai setiap kali
    // "Masukkan ke Tabel". Mau ganti: pilih lagi di form, klik tombol yang sama.
    // Disimpan di localStorage (per subdomain Erzap, per browser).
    //
    // Kunci baru: versi 1.0.0 mengisi kunci lama OTOMATIS dengan outlet Ngawi hardcode
    // (bukan pilihan user), jadi nilai lama itu dibuang dan semua mulai dari setting manual.
    var KUNCI_LOCALSTORAGE_HEADER = 'erzap_pemindahan_barang_header_v2';
    var KUNCI_LOCALSTORAGE_HEADER_LAMA = 'erzap_pemindahan_barang_header_tersimpan';

    function buang_header_lama() {
        try { localStorage.removeItem(KUNCI_LOCALSTORAGE_HEADER_LAMA); } catch (e) {}
    }

    // null kalau belum pernah disimpan / isinya tidak lengkap
    function baca_header_tersimpan() {
        try {
            var h = JSON.parse(localStorage.getItem(KUNCI_LOCALSTORAGE_HEADER) || 'null');
            var lengkap = h && LABEL_HEADER.every(function (l) {
                return typeof h[l] === 'string' && h[l] !== '';
            });
            if (lengkap) {
                return h;
            }
        } catch (e) {}
        return null;
    }

    // Pilihan yang sedang terpasang di form halaman ini (teks opsi yang dipilih).
    // Opsi placeholder ("Please select" dsb, value="") dianggap belum dipilih.
    function baca_header_dari_form() {
        var header = {};
        LABEL_HEADER.forEach(function (label) {
            var $field = $('#' + ID_FIELD_HEADER[label]);
            var teks = '';
            if ($field.length > 0) {
                if ($field.is('select')) {
                    if ($field.val()) {
                        teks = $.trim($field.find('option:selected').text());
                    }
                } else {
                    teks = $.trim($field.val() || '');
                }
            }
            header[label] = teks;
        });
        return header;
    }

    function render_header_lihat_barang() {
        var header = baca_header_tersimpan();
        var html;
        if (!header) {
            html = '<div style="white-space:normal;color:#dc2626;">' +
                '<strong>Dari/Ke Outlet &amp; Gudang belum disimpan.</strong><br>' +
                'Tutup modal ini, pilih Dari Outlet, Dari Gudang, Ke Outlet &amp; Ke Gudang di form, ' +
                'lalu buka lagi dan klik <em>Simpan dari Form</em>.</div>';
        } else {
            html = '<div style="color:#666;">Dipakai saat Masukkan ke Tabel:</div>';
            LABEL_HEADER.forEach(function (label) {
                html += '<div><strong>' + escape_html(label) + ':</strong> ' + escape_html(header[label]) + '</div>';
            });
        }
        $('#llb_header').html(html);
        perbarui_tombol_simpan_header();
    }

    function perbarui_tombol_simpan_header() {
        var ada = !!baca_header_tersimpan();
        $('#llb_btn_simpan_header').prop('disabled', false)
            .text(ada ? 'Ganti dengan Pilihan di Form' : 'Simpan dari Form');
    }

    // ---------- Dialog di dalam halaman (pengganti alert()/confirm() bawaan browser) ----------
    // Dialog bawaan bisa DIBLOKIR browser (mis. user pernah mencentang "Jangan izinkan
    // halaman ini membuat dialog"): confirm() langsung dianggap Batal tanpa tampil apa pun,
    // jadi klik tombol terasa tidak jalan. Dialog ini bagian dari halaman, selalu tampil.
    // opsi: { judul, isi_html, bahaya (judul merah), teks_ya (kosong = cuma tombol OK),
    //         teks_batal, on_ya }
    var DIALOG_HTML =
        '<div id="llb_dialog"><div class="llb_dialog_kotak">' +
            '<div id="llb_dialog_judul"></div>' +
            '<div id="llb_dialog_isi"></div>' +
            '<div class="llb_dialog_tombol">' +
                '<button type="button" id="llb_dialog_batal">Batal</button>' +
                '<button type="button" id="llb_dialog_ya"></button>' +
            '</div>' +
        '</div></div>';

    function tampilkan_dialog(opsi) {
        var $ya = $('#llb_dialog_ya');
        var $batal = $('#llb_dialog_batal');
        $('#llb_dialog_judul').text(opsi.judul || '').css('color', opsi.bahaya ? '#dc2626' : '#333');
        $('#llb_dialog_isi').html(opsi.isi_html || '');
        $ya.off('click').text(opsi.teks_ya || '').toggle(!!opsi.teks_ya);
        $batal.off('click').text(opsi.teks_ya ? (opsi.teks_batal || 'Batal') : 'OK');
        $ya.on('click', function () {
            tutup_dialog();
            if (opsi.on_ya) {
                opsi.on_ya();
            }
        });
        $batal.on('click', tutup_dialog);
        $('#llb_dialog').css('display', 'flex');
        (opsi.teks_ya ? $ya : $batal).trigger('focus');
    }

    function tutup_dialog() {
        $('#llb_dialog').css('display', 'none');
    }

    function info_dialog(judul, isi_html, bahaya) {
        tampilkan_dialog({ judul: judul, isi_html: isi_html, bahaya: bahaya });
    }

    function daftar_html(items) {
        return '<ul>' + items.map(function (x) { return '<li>' + escape_html(x) + '</li>'; }).join('') + '</ul>';
    }

    function tabel_header_html(header) {
        return '<table class="llb_dialog_tabel">' + LABEL_HEADER.map(function (l) {
            return '<tr><td>' + escape_html(l) + '</td><td><b>' + escape_html(header[l]) + '</b></td></tr>';
        }).join('') + '</table>';
    }

    function simpan_header_ke_localstorage() {
        var header = baca_header_dari_form();
        var kosong = LABEL_HEADER.filter(function (l) { return !header[l]; });
        if (kosong.length > 0) {
            info_dialog('Belum dipilih di form',
                '<p>Field berikut belum dipilih di form halaman ini:</p>' + daftar_html(kosong) +
                '<p>Tutup jendela ini, pilih dulu di form, lalu buka lagi Log Data Pemindahan dan klik Simpan.</p>', true);
            return;
        }
        var lama = baca_header_tersimpan();
        if (!lama) {
            tulis_header_tersimpan(header);
            return;
        }
        var sama = LABEL_HEADER.every(function (l) { return lama[l] === header[l]; });
        if (sama) {
            info_dialog('Tidak ada perubahan', '<p>Pilihan di form sama dengan yang sudah tersimpan.</p>');
            return;
        }
        tampilkan_dialog({
            judul: 'Ganti pengaturan tersimpan?',
            isi_html: '<p>Pengaturan baru (dari pilihan di form sekarang):</p>' + tabel_header_html(header),
            teks_ya: 'Ya, Ganti',
            on_ya: function () { tulis_header_tersimpan(header); }
        });
    }

    function tulis_header_tersimpan(header) {
        try {
            localStorage.setItem(KUNCI_LOCALSTORAGE_HEADER, JSON.stringify(header));
        } catch (e) {
            info_dialog('Gagal menyimpan', '<p>Gagal menyimpan ke localStorage: ' + escape_html(e.message) + '</p>', true);
            return;
        }
        render_header_lihat_barang();
    }

    // Dipanggil saat klik "Masukkan ke Tabel". Tanpa pengaturan tersimpan proses ditolak
    // (lebih aman daripada menebak outlet/gudang). Kalau ada, user WAJIB cek ulang dulu
    // outlet & gudang yang akan dipakai; lanjut(header) hanya jalan kalau klik "Ya".
    function minta_konfirmasi_header(jumlah_barang, lanjut) {
        var header = baca_header_tersimpan();
        if (!header) {
            info_dialog('Outlet & Gudang belum disimpan',
                '<p>Pilih dulu Dari Outlet, Dari Gudang, Ke Outlet &amp; Ke Gudang di form halaman ini, ' +
                'lalu buka Log Data Pemindahan dan klik <b>Simpan dari Form</b>.</p>', true);
            return;
        }
        var peringatan = header['Dari Gudang'] === header['Ke Gudang']
            ? '<div class="llb_dialog_awas">⚠️ Dari Gudang dan Ke Gudang SAMA.</div>' : '';
        tampilkan_dialog({
            judul: '⚠️ Cek Ulang Outlet & Gudang',
            bahaya: true,
            isi_html: '<p>Barang akan dimasukkan ke tabel dengan pengaturan ini. Pastikan sudah benar:</p>' +
                tabel_header_html(header) + peringatan +
                '<p>Jumlah barang: <b>' + jumlah_barang + '</b></p>' +
                '<p class="llb_dialog_kecil">Kalau salah: klik Batal, ganti pilihan di form, ' +
                'lalu klik "Ganti dengan Pilihan di Form".</p>',
            teks_ya: 'Ya, Masukkan ke Tabel',
            on_ya: function () { lanjut(header); }
        });
    }

    // Terapkan header hasil fetch ke form yang sedang dibuka. Outlet diisi lebih dulu,
    // baru Gudang diisi ~500ms kemudian - untuk berjaga-jaga kalau opsi Gudang baru
    // muncul via ajax setelah Outlet dipilih (pola dropdown bertingkat yang umum di form ini).
    // Beberapa dropdown custom (Chosen/Select2/Bootstrap-select/dll) menggambar ulang
    // tampilannya sendiri dan tidak cukup diberi tahu lewat .trigger('change') biasa -
    // masing-masing library punya event/API refresh sendiri. Karena tidak kelihatan
    // library apa yang dipakai halaman ini (kalau ada), semua dicoba sekaligus di sini;
    // aman kalau ternyata tidak ada satupun yang terpasang (trigger custom event yang
    // tidak ada listener-nya cuma no-op).
    function segarkan_tampilan_dropdown($field) {
        try { $field.trigger('chosen:updated'); } catch (e) {}
        try { $field.trigger('liszt:updated'); } catch (e) {}
        try { $field.trigger('change.select2'); } catch (e) {}
        try {
            if ($.fn.select2 && $field.data('select2')) {
                $field.trigger({ type: 'select2:select' });
            }
        } catch (e) {}
        try {
            if ($.fn.selectpicker) {
                $field.selectpicker('refresh');
            }
        } catch (e) {}
        try {
            $field[0].dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {}
    }

    // ID asli field header di form ini (dari HTML yang dikirim user) - dipakai
    // langsung, bukan lagi tebak-tebakan lewat teks label.
    var ID_FIELD_HEADER = {
        'Dari Outlet': 'pemindahan_barang_idoutlet_own',
        'Dari Gudang': 'pemindahan_barang_idgudang_asal',
        'Ke Outlet': 'pemindahan_barang_idoutlet_tujuan',
        'Ke Gudang': 'pemindahan_barang_idgudang_tujuan'
    };

    // Beda dengan versi lama: sekarang MENUNGGU (polling, bukan delay tetap) sampai
    // opsinya benar-benar muncul di <select>, karena "Ke Outlet"/Gudang bisa saja baru
    // ke-refresh lewat ajax SETELAH field sebelumnya diubah (mis. exclude outlet yang
    // sama dipilih di "Dari Outlet"). Kalau sampai batas waktu opsinya tetap tidak ada,
    // dianggap GAGAL (bukan cuma warning diam-diam) - dilaporkan balik lewat cb(false)
    // supaya proses menyalin barang tidak lanjut dengan Outlet/Gudang yang salah/kosong.
    function terapkan_satu_field_header_async(label, nilai_teks, cb, maks_tunggu_ms) {
        if (!nilai_teks) {
            console.warn('[lihat-barang]', label, '-> tidak ada nilai dari hasil fetch, dilewati.');
            cb(true);
            return;
        }
        var id_asli = ID_FIELD_HEADER[label];
        var mulai = Date.now();
        maks_tunggu_ms = maks_tunggu_ms || 5000;

        (function cek() {
            var $field = $('#' + id_asli);
            if ($field.length === 0) {
                if (Date.now() - mulai > maks_tunggu_ms) {
                    console.warn('[lihat-barang]', label, '-> field #' + id_asli + ' tidak pernah muncul di halaman ini.');
                    cb(false);
                    return;
                }
                setTimeout(cek, 150);
                return;
            }
            if (!$field.is('select')) {
                $field.val(nilai_teks).trigger('change');
                console.log('[lihat-barang]', label, '-> berhasil di-set (input teks) ke:', nilai_teks);
                cb(true);
                return;
            }
            var $opsi = $field.find('option').filter(function () {
                return $.trim($(this).text()) === nilai_teks;
            }).first();
            if ($opsi.length > 0) {
                var nilai_target = $opsi.val();
                $field.val(nilai_target).trigger('change');
                segarkan_tampilan_dropdown($field);
                // Verifikasi setelah jeda - beberapa field di halaman ini kelihatannya
                // diganti/direset lewat ajax tak lama setelah field LAIN berubah, yang
                // bisa menimpa balik nilai yang barusan di-set di sini. Kalau ternyata
                // balik kosong/berubah, ulangi dari awal (cari elemen #id_asli lagi,
                // karena elemennya sendiri bisa jadi sudah diganti).
                setTimeout(function () {
                    var $field_lagi = $('#' + id_asli);
                    if ($field_lagi.length > 0 && $field_lagi.val() == nilai_target) {
                        console.log('[lihat-barang]', label, '-> berhasil di-set ke opsi (terverifikasi):', nilai_teks);
                        cb(true);
                    } else if (Date.now() - mulai > maks_tunggu_ms) {
                        console.warn('[lihat-barang]', label, '-> sempat di-set tapi nilainya balik berubah, dan sudah melewati batas waktu.');
                        cb(false);
                    } else {
                        console.warn('[lihat-barang]', label, '-> sempat di-set tapi nilainya balik berubah (kemungkinan elemennya diganti/direset), mencoba lagi...');
                        cek();
                    }
                }, 400);
                return;
            }
            if (Date.now() - mulai > maks_tunggu_ms) {
                var daftar_opsi = $field.find('option').map(function () { return $.trim($(this).text()); }).get();
                console.warn('[lihat-barang]', label, '-> opsi "' + nilai_teks + '" tidak pernah muncul setelah ditunggu ' + maks_tunggu_ms + 'ms. Opsi yang tersedia saat ini:', daftar_opsi,
                    '(kemungkinan halaman ini melarang "' + label + '" sama dengan outlet/gudang lain yang sudah dipilih)');
                cb(false);
                return;
            }
            setTimeout(cek, 150);
        })();
    }

    function terapkan_header_ke_form(header, on_selesai) {
        var gagal = [];

        function langkah(label, next) {
            terapkan_satu_field_header_async(label, header[label], function (berhasil) {
                if (!berhasil) {
                    gagal.push(label);
                }
                next();
            });
        }

        langkah('Dari Outlet', function () {
            langkah('Ke Outlet', function () {
                langkah('Dari Gudang', function () {
                    langkah('Ke Gudang', function () {
                        if (on_selesai) {
                            on_selesai(gagal);
                        }
                    });
                });
            });
        });
    }

    function normalisasi_link(input) {
        input = $.trim(input);
        if (input === '') {
            return window.location.href;
        }
        if (/^\d+$/.test(input)) {
            return location.origin + '/pemindahan_barangs/' + input;
        }
        return input;
    }

    var data_lihat_barang_terakhir = [];
    var data_tr_barang_terakhir = []; // elemen <tr> asli (detached) dari halaman sumber - dipakai oleh V2

    // Ringkasan di atas tabel (di luar area scroll, jadi selalu kelihatan): jumlah baris barang dan
    // total jumlah. Total hanya ditampilkan kalau semua jumlah terbaca angka (jumlah kosong dihitung 1,
    // sama seperti saat dimasukkan ke tabel); format lain tidak ditebak.
    function ringkasan_barang_html(rows) {
        var total = 0;
        var semua_angka = true;
        rows.forEach(function (r) {
            var j = $.trim(String(r.jumlah === null || r.jumlah === undefined ? '' : r.jumlah));
            if (j === '') {
                total += 1;
            } else if (/^\d+(\.\d+)?$/.test(j)) {
                total += parseFloat(j);
            } else {
                semua_angka = false;
            }
        });
        var html = 'Jumlah barang: <b>' + rows.length + '</b>';
        if (semua_angka) {
            html += ' &middot; Total jumlah: <b>' + (Math.round(total * 1000) / 1000) + '</b>';
        }
        return html;
    }

    function render_hasil_lihat_barang(rows) {
        data_lihat_barang_terakhir = rows;
        if (rows.length === 0) {
            $('#llb_ringkasan').empty();
            $('#llb_hasil').html('<p style="font-size:12px;color:#999;">Tidak ada data barang ditemukan.</p>');
            return;
        }
        $('#llb_ringkasan').html(ringkasan_barang_html(rows));
        var html = '<table class="llb_table"><thead><tr><th>No</th><th>Barcode</th><th>Jumlah Transfer</th><th>Keterangan</th></tr></thead><tbody>';
        rows.forEach(function (r, i) {
            html += '<tr><td>' + (i + 1) + '</td><td>' + escape_html(r.barcode) + '</td><td>' + escape_html(r.jumlah) + '</td><td>' + escape_html(r.keterangan) + '</td></tr>';
        });
        html += '</tbody></table>';
        $('#llb_hasil').html(html);
    }

    // Hasil ekstrak_*: { rows: [{barcode, jumlah, keterangan}], tr_list: <tr> asli yang bisa disalin V2 }.
    // tr_list sama panjang dengan rows kalau semua baris punya field produk lengkap; kalau kosong/beda
    // panjang, "Masukkan ke Tabel" jatuh ke V1 (scan ulang barcode + jumlah), lihat masukkan_sesuai_sumber.
    function ekstrak_baris_pemindahan($wrap) {
        var rows = [];
        var tr_list = [];
        $wrap.find('#pemindahan_barang_detail tbody tr').each(function () {
            if (!/^tr_\d+$/.test(this.id || '')) {
                return;
            }
            var data = ambil_data_baris(this);
            if (data) {
                rows.push(data);
                tr_list.push(this);
            }
        });
        return { rows: rows, tr_list: tr_list };
    }

    // Halaman Faktur Pembelian (/faktur_pembelians/<ID>) belum pernah kelihatan HTML aslinya di sini,
    // jadi dicoba dua cara berurutan:
    //   1) baris berisi field produk yang sama dengan form Pemindahan (.data_produk_id, .jumlah_produk, ...)
    //      -> bisa disalin langsung (V2);
    //   2) tabel biasa: kolom Barcode / Jumlah(Qty) / Keterangan dicari lewat teks header
    //      -> cuma barcode + jumlah yang dipakai, dimasukkan lewat scan ulang (V1).
    // Kalau dua-duanya tidak mengenali apa pun, header tabel yang ada dicetak ke console untuk dicek.
    function ekstrak_baris_pembelian($wrap) {
        var rows = [];
        var tr_list = [];

        $wrap.find('tr').each(function () {
            if ($.trim($(this).find('.data_produk_id').val() || '') === '') {
                return;
            }
            var data = ambil_data_baris(this);
            if (!data) {
                return;
            }
            // Beda dengan Pemindahan: sel terakhir di sini belum tentu Keterangan.
            var $ket = $(this).find('input[name$="[keterangan]"], textarea[name$="[keterangan]"]').first();
            data.keterangan = $ket.length > 0 ? $ket.val() : '';
            rows.push(data);
            tr_list.push(this);
        });
        if (rows.length > 0) {
            return { rows: rows, tr_list: tr_list };
        }

        function teks_sel($sel) {
            return $.trim($sel.find('input, textarea').first().val() || $sel.text());
        }

        $wrap.find('table').each(function () {
            var $table = $(this);
            var $head = $table.find('thead tr').last();
            if ($head.length === 0) {
                $head = $table.find('tr').first();
            }
            var kol = { barcode: -1, jumlah: -1, keterangan: -1 };
            $head.children('th, td').each(function (i) {
                var t = $.trim($(this).text()).toLowerCase();
                if (kol.barcode < 0 && t.indexOf('barcode') !== -1) {
                    kol.barcode = i;
                } else if (kol.jumlah < 0 && /^(jumlah|qty)/.test(t)) {
                    kol.jumlah = i;
                } else if (kol.keterangan < 0 && t.indexOf('keterangan') !== -1) {
                    kol.keterangan = i;
                }
            });
            if (kol.barcode < 0 || kol.jumlah < 0) {
                return;
            }
            $table.find('tr').each(function () {
                var $cells = $(this).children('td');
                if (this === $head[0] || $cells.length <= Math.max(kol.barcode, kol.jumlah)) {
                    return;
                }
                // Sel produk di Erzap berbentuk "Barcode - Nama Barang - Kode Ref": ambil barcode-nya saja.
                var barcode = $.trim(teks_sel($cells.eq(kol.barcode)).split(/\s+-\s+/)[0]);
                if (barcode === '') {
                    return;
                }
                var teks_jumlah = teks_sel($cells.eq(kol.jumlah));
                var angka = /-?\d[\d.,]*/.exec(teks_jumlah);
                rows.push({
                    barcode: barcode,
                    jumlah: angka ? angka[0] : teks_jumlah,
                    keterangan: kol.keterangan >= 0 && kol.keterangan < $cells.length ? teks_sel($cells.eq(kol.keterangan)) : ''
                });
            });
            if (rows.length > 0) {
                return false; // tabel pertama yang cocok sudah cukup
            }
        });

        if (rows.length === 0) {
            var header_tabel = [];
            $wrap.find('table').each(function () {
                header_tabel.push($(this).find('tr').first().children().map(function () {
                    return $.trim($(this).text());
                }).get());
            });
            console.warn('[lihat-barang] Faktur Pembelian: tidak ada baris barang yang dikenali. Header tabel di halaman:', header_tabel);
        }
        return { rows: rows, tr_list: [] };
    }

    // Nomor muatan terakhir: respons dari muatan sebelumnya (modal sudah ditutup / ganti mode / user
    // menekan Tampilkan lagi) datang belakangan dan tidak boleh menimpa hasil muatan yang baru.
    var nomor_muatan = 0;

    function muat_data_dari_link(link) {
        var nomor = ++nomor_muatan;
        $('#llb_status').text('Memuat data dari ' + link + ' ...');
        $('#llb_hasil, #llb_ringkasan').empty();
        // Data dari muatan sebelumnya jangan sampai ikut dimasukkan kalau muatan baru ini gagal.
        data_lihat_barang_terakhir = [];
        data_tr_barang_terakhir = [];
        $('#llb_btn_tampilkan').prop('disabled', true);

        $.ajax({
            url: link,
            dataType: 'html',
            success: function (html) {
                if (nomor !== nomor_muatan) {
                    return;
                }
                var $wrap = $('<div>').append($($.parseHTML(html)));
                var hasil = mode_sumber === 'pembelian' ? ekstrak_baris_pembelian($wrap) : ekstrak_baris_pemindahan($wrap);
                var rows = hasil.rows;
                data_tr_barang_terakhir = hasil.tr_list;
                // Cuma daftar barang yang diambil dari halaman/link ini. Dari/Ke Outlet &
                // Gudang selalu dari pengaturan tersimpan user (lihat render_header_lihat_barang).
                var pesan = 'Ditemukan ' + rows.length + ' barang.';
                if (mode_sumber === 'pembelian' && rows.length === 0) {
                    pesan += ' Isi halaman Faktur Pembelian belum dikenali (detail di console, F12).';
                }
                $('#llb_status').text(pesan);
                render_hasil_lihat_barang(rows);
                log_nilai_dropdown_halaman('SESUDAH fetch selesai (' + link + ')');
            },
            error: function () {
                if (nomor === nomor_muatan) {
                    $('#llb_status').text('Gagal memuat data dari link tersebut.');
                }
            },
            complete: function () {
                if (nomor === nomor_muatan) {
                    $('#llb_btn_tampilkan').prop('disabled', false);
                }
            }
        });
    }

    // Diagnostik sementara: cetak nilai dropdown Dari/Ke Outlet & Gudang DI HALAMAN
    // INI (bukan hasil fetch), buat mastiin apakah benar-benar berubah cuma karena
    // buka modal / klik Tampilkan (yang harusnya cuma baca, tidak menulis apa pun
    // ke halaman ini).
    function log_nilai_dropdown_halaman(konteks) {
        LABEL_HEADER.forEach(function (label) {
            var $f = cari_field_by_label($(document), label);
            console.log('[cek-dropdown]', konteks, '|', label, '=',
                $f.length > 0 ? $f.val() : '(field tidak ditemukan di halaman ini)');
        });
    }

    function buka_modal_dengan_mode(mode) {
        var pembelian = mode === 'pembelian';
        mode_sumber = mode;
        nomor_muatan++;   // muatan / pencarian dari modal sebelumnya diabaikan
        data_lihat_barang_terakhir = [];
        data_tr_barang_terakhir = [];
        $('#llb_judul').text(pembelian ? 'Data Pembelian' : 'Log Data Pemindahan');
        $('#llb_petunjuk').html(pembelian ? PETUNJUK_PEMBELIAN : PETUNJUK_BARANG);
        $('#llb_input_link').val('').attr('placeholder', pembelian ? PLACEHOLDER_PEMBELIAN : PLACEHOLDER_BARANG);
        $('#llb_status').text('');
        $('#llb_hasil, #llb_ringkasan').empty();
        $('#llb_progress').hide().text('');
        $('#llb_btn_tampilkan').prop('disabled', false);
        render_header_lihat_barang();
        // "Masukkan ke Tabel" hanya masuk akal kalau tabel di halaman ini masih bisa diisi.
        var bisa_impor = $('#term_produk_quick').length > 0 && !$('#term_produk_quick').is(':disabled');
        $('#llb_btn_masukkan_v2').toggle(bisa_impor);
        buka_modal('#modal_lihat_barang');
    }

    function buka_modal_lihat_barang() {
        log_nilai_dropdown_halaman('SEBELUM buka modal');
        buka_modal_dengan_mode('barang');
        muat_data_dari_link(window.location.href);
    }

    // Faktur Pembelian tidak punya "halaman ini" untuk dimuat otomatis: tunggu user mengisi ID/link.
    function buka_modal_pembelian() {
        buka_modal_dengan_mode('pembelian');
        $('#llb_input_link').trigger('focus');
    }

    // ---------- Cari transfer lewat KODE No Pemindahan (mis. PG0926-21559) ----------
    // Meniru form Pencarian (tombol Filter) di daftar Pemindahan:
    // POST /pemindahan_barangs/index/new dengan pencarian[kode] + rentang tanggal (wajib).
    // Responsnya halaman daftar (HTML); ID diambil dari link /pemindahan_barangs/<ID> di
    // baris yang sel Kode-nya PERSIS sama (pencarian Erzap bisa cocok sebagian).
    var URL_CARI_PEMINDAHAN = '/pemindahan_barangs/index/new';
    var POLA_KODE_PEMINDAHAN = /^[A-Za-z]{1,6}\d{4}-\d+$/;

    function dua_digit(n) {
        return (n < 10 ? '0' : '') + n;
    }

    function format_tgl(d) {
        return dua_digit(d.getDate()) + '-' + dua_digit(d.getMonth() + 1) + '-' + d.getFullYear();
    }

    // Rentang tanggal yang dicoba berurutan. Kode "PG0926-..." = dibuat bulan 09 tahun 2026,
    // jadi coba bulan itu dulu, lalu +-1 bulan, terakhir 3 bulan terakhir s/d hari ini.
    function rentang_tanggal_kode(kode) {
        var hasil = [];
        var m = /^[A-Za-z]+(\d{2})(\d{2})-/.exec(kode);
        if (m) {
            var bulan = parseInt(m[1], 10);
            var tahun = 2000 + parseInt(m[2], 10);
            if (bulan >= 1 && bulan <= 12) {
                hasil.push([new Date(tahun, bulan - 1, 1), new Date(tahun, bulan, 0)]);
                hasil.push([new Date(tahun, bulan - 2, 1), new Date(tahun, bulan + 1, 0)]);
            }
        }
        var hari_ini = new Date();
        hasil.push([new Date(hari_ini.getFullYear(), hari_ini.getMonth() - 3, 1), hari_ini]);
        return hasil;
    }

    // Token keamanan Rails: dari <meta name="csrf-token"> halaman ini, atau (cadangan)
    // dari form Pencarian di halaman daftar Pemindahan.
    function ambil_token_csrf() {
        var d = $.Deferred();
        var meta = $('meta[name="csrf-token"]').attr('content');
        if (meta) {
            return d.resolve(meta).promise();
        }
        $.ajax({ url: '/pemindahan_barangs?id=new', type: 'GET', dataType: 'text' })
            .done(function (html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var el = doc.querySelector('meta[name="csrf-token"]');
                var token = el ? el.getAttribute('content') : '';
                if (!token) {
                    el = doc.querySelector('input[name="authenticity_token"]');
                    token = el ? el.value : '';
                }
                if (token) {
                    d.resolve(token);
                } else {
                    d.reject('token keamanan tidak ketemu');
                }
            })
            .fail(function (xhr) {
                d.reject('gagal membuka daftar Pemindahan (HTTP ' + xhr.status + ')');
            });
        return d.promise();
    }

    var POLA_HREF_PEMINDAHAN = /\/pemindahan_barangs\/(\d+)(?:[\/?#]|$)/;
    var POLA_HREF_FAKTUR_PEMBELIAN = /\/faktur_pembelians\/(\d+)(?:[\/?#]|$)/;

    function normalisasi_judul(teks) {
        return $.trim(String(teks).replace(/[*:]/g, '')).toLowerCase();
    }

    // Posisi kolom dengan judul tertentu di tabel milik <tr> (-1 kalau tidak ada / <tr> itu sendiri header).
    function indeks_kolom(tr, judul) {
        var tabel = tr.closest('table');
        var baris_header = tabel && (tabel.querySelector('thead tr') || tabel.rows[0]);
        if (!baris_header || baris_header === tr) {
            return -1;
        }
        return Array.prototype.findIndex.call(baris_header.cells, function (th) {
            return normalisasi_judul(th.textContent) === judul;
        });
    }

    // judul_kolom (opsional): kode HANYA dicocokkan di kolom itu. Penting untuk kode angka pendek
    // (mis. No Faktur "1") yang kalau dicocokkan ke semua sel bisa kena kolom nomor urut "No".
    function id_dari_hasil_cari(html, kode, pola_href, judul_kolom) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var target = kode.toUpperCase();
        var ids = [];
        Array.prototype.forEach.call(doc.querySelectorAll('tr'), function (tr) {
            var idx = judul_kolom ? indeks_kolom(tr, judul_kolom) : -1;
            var sel_dicek = idx >= 0 && idx < tr.cells.length ? [tr.cells[idx]] : tr.cells;
            var cocok = Array.prototype.some.call(sel_dicek, function (td) {
                var teks = $.trim(td.textContent).toUpperCase();
                if (teks === target) {
                    return true;
                }
                // Sel No Faktur di daftar Faktur Pembelian memuat teks lain di samping kodenya
                // (mis. link "J1026-68557" lalu "Ditutup - Hutang"), dan <br> tidak menyisakan spasi
                // di textContent, jadi kode dicari juga di tiap elemen anak dan tiap potongan teks langsung.
                var kandidat = teks.split(/\s+/);
                Array.prototype.forEach.call(td.querySelectorAll('*'), function (el) {
                    kandidat.push($.trim(el.textContent).toUpperCase());
                });
                Array.prototype.forEach.call(td.childNodes, function (n) {
                    if (n.nodeType === 3) {
                        kandidat.push($.trim(n.nodeValue).toUpperCase());
                    }
                });
                return kandidat.indexOf(target) !== -1;
            });
            if (!cocok) {
                return;
            }
            Array.prototype.forEach.call(tr.querySelectorAll('a[href]'), function (a) {
                var m = pola_href.exec(a.getAttribute('href'));
                if (m && ids.indexOf(m[1]) === -1) {
                    ids.push(m[1]);
                }
            });
        });
        return ids;
    }

    // resolve(id) kalau ketemu tepat 1 transfer; reject(pesan) kalau tidak/ambigu/gagal
    function cari_id_dari_kode(kode, tulis_status) {
        var d = $.Deferred();
        var rentang = rentang_tanggal_kode(kode);
        tulis_status('Menyiapkan pencarian kode ' + kode + ' ...');
        ambil_token_csrf()
            .fail(function (e) {
                d.reject('Gagal mencari kode ' + kode + ': ' + e + '.');
            })
            .done(function (token) {
                var i = 0;
                (function coba() {
                    if (i >= rentang.length) {
                        var akhir = rentang[rentang.length - 1];
                        d.reject('Kode ' + kode + ' tidak ditemukan, baik di bulan kodenya maupun 3 bulan terakhir (' +
                            format_tgl(akhir[0]) + ' s/d ' + format_tgl(akhir[1]) + '). Cek lagi kodenya, atau masukkan ID/link-nya.');
                        return;
                    }
                    var r = rentang[i++];
                    tulis_status('Mencari kode ' + kode + ' (' + format_tgl(r[0]) + ' s/d ' + format_tgl(r[1]) + ') ...');
                    $.ajax({
                        url: URL_CARI_PEMINDAHAN,
                        type: 'POST',
                        dataType: 'text',
                        data: {
                            'utf8': '\u2713',
                            'authenticity_token': token,
                            'pencarian[is_show_produk]': '0',
                            'pencarian[kode]': kode,
                            'pencarian[tanggal_dari]': format_tgl(r[0]),
                            'pencarian[tanggal_sampai]': format_tgl(r[1]),
                            'pencarian[idoutlet_own]': '',
                            'pencarian[idgudang_asal]': '',
                            'pencarian[idoutlet_tujuan]': '',
                            'pencarian[idgudang_tujuan]': '',
                            'pencarian[pemindah]': '',
                            'pencarian[nama_produk]': '',
                            'pencarian[serial_number]': '',
                            'pencarian[tmp_no_batch]': ''
                        }
                    })
                        .done(function (html) {
                            var ids = id_dari_hasil_cari(html, kode, POLA_HREF_PEMINDAHAN);
                            if (ids.length === 1) {
                                d.resolve(ids[0]);
                            } else if (ids.length > 1) {
                                d.reject('Kode ' + kode + ' cocok dengan ' + ids.length + ' transfer (ID ' + ids.join(', ') +
                                    '). Masukkan ID-nya langsung.');
                            } else {
                                coba();
                            }
                        })
                        .fail(function (xhr) {
                            d.reject('Pencarian kode ' + kode + ' gagal (HTTP ' + xhr.status + ').');
                        });
                })();
            });
        return d.promise();
    }

    // ---------- Cari Faktur Pembelian lewat KODE (No Faktur, mis. J1026-68557) ----------
    // Meniru alur manual: buka /faktur_pembelians, isi No Faktur di form Pencarian, klik cari, lalu
    // ambil ID dari link di baris yang cocok. Nama field & alamat kirim form Pencarian-nya belum
    // pernah kelihatan di sini, jadi form-nya diambil dari halaman daftar itu sendiri (dicari lewat
    // teks label "No Faktur") dan dikirim ulang apa adanya dengan No Faktur diisi kode - bukan
    // menebak nama field. Format kode (huruf + bulan + tahun + nomor) sama dengan POLA_KODE_PEMINDAHAN.
    var URL_DAFTAR_FAKTUR_PEMBELIAN = '/faktur_pembelians';
    var URL_CARI_FAKTUR_PEMBELIAN = '/faktur_pembelians/index/new'; // cadangan kalau form tidak punya action

    function cari_label_doc($root, label_text) {
        return $root.find('label').filter(function () {
            return $.trim($(this).text().replace(/[*:]/g, '')).toLowerCase() === label_text;
        }).first();
    }

    function cari_field_no_faktur($doc) {
        var $label = cari_label_doc($doc, 'no faktur');
        var $field = $();
        if ($label.length > 0) {
            var untuk = $label.attr('for');
            if (untuk) {
                $field = $doc.find('[id="' + untuk.replace(/"/g, '\\"') + '"]').first();
            }
            if ($field.length === 0) {
                $field = $label.find('input').first();
            }
            if ($field.length === 0) {
                $field = $label.nextAll('input[type="text"], input:not([type])').first();
            }
            if ($field.length === 0) {
                var $kontainer = $label.closest('.field');
                if ($kontainer.length === 0) {
                    $kontainer = $label.parent();
                }
                $field = $kontainer.find('input[type="text"], input:not([type])').first();
            }
        }
        if ($field.length === 0) {
            $field = $doc.find('input[name$="[no_faktur]"], input[name$="[kode]"]').first();
        }
        return $field;
    }

    // Dua kolom Periode (dari - sampai); kosong kalau tidak ketemu pasti dua (lebih baik
    // melewatkan pencarian per tanggal daripada mengisi kolom yang salah).
    function cari_input_periode($form) {
        // Nama field Periode di form Pencarian Erzap (pola yang sama dipakai ppob.js untuk /penjualans):
        // pencarian[tanggal_dari] / pencarian[tanggal_sampai], atau variasinya (tanggal_awal, tanggal_akhir, ...).
        var $teks = $form.find('input').filter(function () {
            return (this.type || 'text').toLowerCase() === 'text';
        });
        var $dari = $teks.filter(function () {
            return /^pencarian\[tanggal[^\]]*(dari|awal|from|mulai)[^\]]*\]$/i.test(this.name);
        }).first();
        var $sampai = $teks.filter(function () {
            return /^pencarian\[tanggal[^\]]*(sampai|akhir|to)[^\]]*\]$/i.test(this.name);
        }).first();
        if ($dari.length > 0 && $sampai.length > 0) {
            return $([$dari[0], $sampai[0]]);
        }
        var $input;
        var $label = cari_label_doc($form, 'periode');
        if ($label.length === 0) {
            return $();
        }
        var $kontainer = $label.closest('.field');
        if ($kontainer.length === 0) {
            $kontainer = $label.parent();
        }
        $input = $kontainer.find('input[type="text"], input:not([type])');
        return $input.length === 2 ? $input : $();
    }

    // Rentang tanggal yang dicoba berurutan untuk No Faktur. Petunjuk bulan dari nomornya kalau ada:
    // "J1026-68557" (huruf + MMYY + "-") atau "JKTDM.10.26.009518" (".MM.YY."); nomor lain (mis. "00999")
    // tidak punya petunjuk. Sisanya melebar bertahap (3 bulan, 12 bulan, 2 tahun) - bertahap karena
    // tidak diketahui apakah server membatasi lebar rentang.
    function rentang_tanggal_faktur(kode) {
        var hasil = [];
        var m = /^[A-Za-z]+(\d{2})(\d{2})-/.exec(kode) || /[.\/-](\d{2})[.\/-](\d{2})[.\/-]/.exec(kode);
        if (m) {
            var bulan = parseInt(m[1], 10);
            var tahun = 2000 + parseInt(m[2], 10);
            if (bulan >= 1 && bulan <= 12) {
                hasil.push([new Date(tahun, bulan - 1, 1), new Date(tahun, bulan, 0)]);
                hasil.push([new Date(tahun, bulan - 2, 1), new Date(tahun, bulan + 1, 0)]);
            }
        }
        var hari_ini = new Date();
        hasil.push([new Date(hari_ini.getFullYear(), hari_ini.getMonth() - 3, 1), hari_ini]);
        hasil.push([new Date(hari_ini.getFullYear() - 1, hari_ini.getMonth(), 1), hari_ini]);
        hasil.push([new Date(hari_ini.getFullYear() - 2, 0, 1), hari_ini]);
        return hasil;
    }

    // Isi kolom "No Faktur" pada baris-baris hasil pencarian (untuk pesan gagal/diagnostik).
    function daftar_no_faktur_hasil(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var daftar = [];
        Array.prototype.forEach.call(doc.querySelectorAll('tr'), function (tr) {
            var idx = indeks_kolom(tr, 'no faktur');
            if (idx >= 0 && idx < tr.cells.length) {
                // Nomornya biasanya berupa link; teks lain di sel (mis. "Ditutup - Hutang") tidak ikut.
                var link = tr.cells[idx].querySelector('a');
                daftar.push($.trim((link || tr.cells[idx]).textContent).replace(/\s+/g, ' '));
            }
        });
        return daftar;
    }

    // resolve(id) kalau ketemu tepat 1 faktur; reject(pesan) kalau tidak/ambigu/gagal
    function cari_id_faktur_dari_kode(kode, tulis_status) {
        var d = $.Deferred();
        tulis_status('Membuka daftar Faktur Pembelian ...');
        $.ajax({ url: URL_DAFTAR_FAKTUR_PEMBELIAN, type: 'GET', dataType: 'text' })
            .fail(function (xhr) {
                d.reject('Gagal membuka daftar Faktur Pembelian (HTTP ' + xhr.status + ').');
            })
            .done(function (html_daftar) {
                var $doc = $(new DOMParser().parseFromString(html_daftar, 'text/html'));
                var $field = cari_field_no_faktur($doc);
                var $form = $field.closest('form');
                if ($field.length === 0 || $form.length === 0) {
                    console.warn('[lihat-barang] Form Pencarian Faktur Pembelian tidak dikenali. Field teks di halaman:',
                        $doc.find('input[type="text"]').map(function () { return this.name || this.id; }).get());
                    d.reject('Kolom "No Faktur" di form Pencarian daftar Faktur Pembelian tidak ditemukan. Tempel link fakturnya.');
                    return;
                }
                $field.val(kode);
                var $periode = cari_input_periode($form);
                // Percobaan pertama memakai isian Periode bawaan form (kosong = seperti klik cari manual);
                // kalau tidak ketemu dan kolom Periode dikenali, coba rentang tanggal (lihat rentang_tanggal_faktur).
                var percobaan = [null].concat($periode.length === 2 ? rentang_tanggal_faktur(kode) : []);
                var hasil_terakhir = null; // No Faktur di baris hasil pencarian terakhir, untuk pesan gagal
                var metode = ($form.attr('method') || 'post').toUpperCase();
                var aksi = $form.attr('action');
                if (!aksi || aksi === '#') {
                    aksi = URL_CARI_FAKTUR_PEMBELIAN;
                }
                var token_halaman = $('meta[name="csrf-token"]').attr('content') || '';
                var i = 0;
                (function coba() {
                    if (i >= percobaan.length) {
                        var rincian = '';
                        if ($periode.length !== 2) {
                            rincian = ' Kolom Periode di form tidak dikenali, jadi hanya dicari dengan Periode bawaan form.';
                        }
                        if (hasil_terakhir && hasil_terakhir.length > 0) {
                            rincian += ' Hasil pencarian terakhir berisi ' + hasil_terakhir.length + ' baris, No Faktur: ' +
                                hasil_terakhir.slice(0, 3).join(', ') + (hasil_terakhir.length > 3 ? ', ...' : '') + '.';
                        } else {
                            rincian += ' Server tidak mengembalikan satu pun baris.';
                        }
                        console.warn('[lihat-barang] No Faktur ' + kode + ' tidak ketemu. Percobaan:', percobaan.length,
                            '| kolom Periode dikenali:', $periode.length === 2, '| aksi:', metode + ' ' + aksi,
                            '| No Faktur di hasil terakhir:', hasil_terakhir);
                        d.reject('No Faktur ' + kode + ' tidak ditemukan di Faktur Pembelian.' + rincian +
                            ' Cek lagi nomornya, atau tempel link fakturnya.');
                        return;
                    }
                    var r = percobaan[i++];
                    if (r) {
                        $periode.eq(0).val(format_tgl(r[0]));
                        $periode.eq(1).val(format_tgl(r[1]));
                    }
                    var data = $form.serializeArray();
                    var punya_token = data.some(function (x) { return x.name === 'authenticity_token'; });
                    if (!punya_token && token_halaman) {
                        data.push({ name: 'authenticity_token', value: token_halaman });
                    }
                    tulis_status('Mencari kode ' + kode + (r ? ' (' + format_tgl(r[0]) + ' s/d ' + format_tgl(r[1]) + ')' : '') + ' ...');
                    $.ajax({ url: aksi, type: metode, dataType: 'text', data: data })
                        .done(function (html) {
                            hasil_terakhir = daftar_no_faktur_hasil(html);
                            var ids = id_dari_hasil_cari(html, kode, POLA_HREF_FAKTUR_PEMBELIAN, 'no faktur');
                            if (ids.length === 1) {
                                d.resolve(ids[0]);
                            } else if (ids.length > 1) {
                                // No Faktur dari supplier bisa kembar antar faktur: pilihannya lewat link.
                                d.reject('No Faktur ' + kode + ' cocok dengan ' + ids.length + ' faktur (ID ' + ids.join(', ') +
                                    '). Tempel link salah satunya, mis. ' + location.origin + '/faktur_pembelians/' + ids[0] + '.');
                            } else {
                                coba();
                            }
                        })
                        .fail(function (xhr) {
                            d.reject('Pencarian kode ' + kode + ' gagal (HTTP ' + xhr.status + ').');
                        });
                })();
            });
        return d.promise();
    }

    function tampilkan_dari_input_link() {
        var isi = $.trim($('#llb_input_link').val());
        var pembelian = mode_sumber === 'pembelian';
        if (pembelian && isi === '') {
            $('#llb_status').text('Masukkan No Faktur Pembelian dulu.');
            return;
        }
        // Faktur Pembelian: apa pun yang bukan link dianggap No Faktur, BUKAN ID. No Faktur dari
        // supplier bisa berupa angka saja (mis. 00999) dan kalau dianggap ID akan membuka faktur lain.
        var adalah_link = /^(https?:)?\/\//i.test(isi) || isi.charAt(0) === '/';
        if (pembelian ? !adalah_link : POLA_KODE_PEMINDAHAN.test(isi)) {
            // Kode berpola (mis. J1026-68557) dibakukan ke huruf besar; nomor bebas dari supplier dikirim apa adanya.
            var kode = POLA_KODE_PEMINDAHAN.test(isi) ? isi.toUpperCase() : isi;
            $('#llb_hasil, #llb_ringkasan').empty();
            // Hasil muatan sebelumnya jangan sampai ikut dimasukkan kalau pencarian kode ini gagal.
            data_lihat_barang_terakhir = [];
            data_tr_barang_terakhir = [];
            $('#llb_btn_tampilkan').prop('disabled', true);
            var nomor = ++nomor_muatan;
            var masih_berlaku = function () { return nomor === nomor_muatan; };
            (pembelian ? cari_id_faktur_dari_kode : cari_id_dari_kode)(kode, function (teks) { if (masih_berlaku()) { $('#llb_status').text(teks); } })
                .done(function (id) {
                    if (!masih_berlaku()) {
                        return;
                    }
                    // Pesan status berikutnya ("Memuat ...", lalu "Ditemukan N barang.") diurus muat_data_dari_link
                    console.log('[lihat-barang] Kode ' + kode + ' = ID ' + id);
                    muat_data_dari_link(location.origin + (pembelian ? '/faktur_pembelians/' : '/pemindahan_barangs/') + id);
                })
                .fail(function (pesan) {
                    if (!masih_berlaku()) {
                        return;
                    }
                    $('#llb_status').text(pesan);
                    $('#llb_btn_tampilkan').prop('disabled', false);
                });
            return;
        }
        muat_data_dari_link(normalisasi_link(isi));
    }

    var TOMBOL_MODAL_LIHAT_BARANG = '#llb_btn_masukkan_v2, #llb_btn_tampilkan, #llb_btn_tutup';

    // Tombol "Masukkan ke Tabel": baris yang punya field produk lengkap (tr_list sama panjang dengan
    // rows) disalin langsung (V2); kalau sumbernya cuma tabel teks (mis. Faktur Pembelian yang
    // tidak punya field form) barcode + jumlahnya di-scan ulang satu-satu (V1).
    function masukkan_sesuai_sumber() {
        var bisa_salin_langsung = data_tr_barang_terakhir.length > 0 &&
            data_tr_barang_terakhir.length === data_lihat_barang_terakhir.length;
        console.log('[lihat-barang] Masukkan ke Tabel:', bisa_salin_langsung ? 'salin langsung (V2)' : 'scan barcode (V1)',
            '| baris:', data_lihat_barang_terakhir.length, '| baris form:', data_tr_barang_terakhir.length);
        if (bisa_salin_langsung) {
            masukkan_hasil_ke_table_v2();
        } else {
            masukkan_hasil_ke_table();
        }
    }

    // ---------- V1: scan ulang tiap barcode (lewat fetch_produk_quick / simulasi Enter) ----------
    // Tidak ada tombolnya sendiri di UI (dilepas atas permintaan); dipakai sebagai cadangan oleh
    // masukkan_sesuai_sumber kalau sumber datanya tidak punya field produk yang bisa disalin.

    function masukkan_hasil_ke_table() {
        if (data_lihat_barang_terakhir.length === 0) {
            info_dialog('Tidak ada data', '<p>Tidak ada barang untuk dimasukkan ke tabel.</p>');
            return;
        }
        minta_konfirmasi_header(data_lihat_barang_terakhir.length, jalankan_masukkan_v1);
    }

    function jalankan_masukkan_v1(header) {
        $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', true);
        $('#llb_progress').show().text('Menerapkan Dari/Ke Outlet & Gudang ...');
        kunci_posisi_scroll();

        terapkan_header_ke_form(header, function (gagal) {
            if (gagal.length > 0) {
                info_dialog('Gagal mengisi Outlet / Gudang',
                    '<p>Proses dibatalkan, tidak ada barang yang dimasukkan. Field berikut tidak bisa diisi:</p>' +
                    daftar_html(gagal) +
                    '<p>Kemungkinan pilihan tersimpan tidak ada di daftar pilihan form ini. Cek lagi, lalu klik ' +
                    '"Ganti dengan Pilihan di Form" kalau perlu.</p>', true);
                $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                lepas_kunci_scroll();
                $('#llb_progress').hide();
                return;
            }
            if (typeof validasi_header_sebelum_scan_produk === 'function') {
                if (!validasi_header_sebelum_scan_produk(HTML_IDOUTLET_OWN, 'Tentukan Outlet terlebih dahulu', true)) {
                    $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                    lepas_kunci_scroll();
                    $('#llb_progress').hide();
                    return;
                }
                if (!validasi_header_sebelum_scan_produk(HTML_IDGUDANG, 'Tentukan Gudang terlebih dahulu', false)) {
                    $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                    lepas_kunci_scroll();
                    $('#llb_progress').hide();
                    return;
                }
            }

            var baris = data_lihat_barang_terakhir.map(function (r) {
                return (r.jumlah || 1) + ' ' + r.barcode;
            });
            console.log('[lihat-barang] Masukkan ke Tabel lewat scan barcode:', baris.length, 'baris');

            jalankan_baris_qty_barcode(baris, '#llb_progress', function (hasil) {
                $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                lepas_kunci_scroll();
                // Halaman Erzap bisa menolak sebagian barcode (produk tidak ketemu, stok kurang, dst) tanpa
                // memberi tahu kita. Jangan menutup modal seolah semuanya masuk: laporkan yang gagal
                // (dari konfirmasi per barang: jumlahnya di tabel tidak bertambah).
                var belum = hasil.gagal.filter(function (b, i, semua) { return semua.indexOf(b) === i; });
                if (belum.length > 0) {
                    $('#llb_progress').text('Selesai, tapi ' + hasil.gagal.length + ' dari ' + baris.length + ' baris tidak masuk.');
                    info_dialog('Sebagian barang belum masuk ke tabel',
                        '<p><b>' + hasil.berhasil.length + '</b> dari <b>' + baris.length + '</b> baris masuk ke tabel.</p>' +
                        '<p>Barcode yang jumlahnya tidak bertambah di tabel:</p>' + daftar_html(belum.slice(0, 10)) +
                        (belum.length > 10 ? '<p>... dan ' + (belum.length - 10) + ' lainnya.</p>' : '') +
                        '<p class="llb_dialog_kecil">Cek pesan dari halaman Erzap (mis. produk tidak ditemukan atau stok kurang). ' +
                        'Barang yang sudah masuk tidak dihapus.</p>', true);
                    return;
                }
                tutup_semua_modal();
            });
        });
    }

    // ---------- V2: copy langsung semua field produk ke baris kosong, tanpa scan ulang ----------
    // Field yang sama-sama diisi fetch_produk_quick saat barcode ketemu (lihat search_barcode/
    // change handler bawaan halaman ini) - Stok Asal/Tujuan & harga TIDAK disalin karena itu
    // milik konteks lama (gudang/tanggal beda), sengaja dibiarkan kosong/di-refresh manual.
    var KELAS_FIELD_DISALIN_V2 = [
        'searching_produk_barcode',
        'searching_produk_barcode_on_nama_produk',
        'data_produk_id',
        'data_produk_barcode',
        'produk_nama',
        'produk_kode_ref',
        'produk_is_jasa',
        'produk_is_sn',
        'produk_is_paket',
        'produk_is_harga_jual_include_ppn',
        'produk_is_bahan',
        'produk_is_non_ppn',
        'produk_flat_price_count',
        'produk_is_use_no_batch',
        'searching_barcode_produk_id'
    ];

    function cari_baris_kosong_atau_tambah(cb) {
        var $kosong = $('.searching_produk_barcode').filter(function () {
            return $.trim(this.value) === '';
        }).first();
        if ($kosong.length > 0) {
            cb($kosong.closest('tr')[0]);
            return;
        }
        if (typeof tambah_baris !== 'function') {
            cb(null);
            return;
        }
        tambah_baris();
        var percobaan = 0;
        var cek = setInterval(function () {
            percobaan++;
            var $kosong2 = $('.searching_produk_barcode').filter(function () {
                return $.trim(this.value) === '';
            }).first();
            if ($kosong2.length > 0) {
                clearInterval(cek);
                cb($kosong2.closest('tr')[0]);
            } else if (percobaan > 40) { // ~6 detik, jaga-jaga kalau ajax tambah_baris gagal/lambat
                clearInterval(cek);
                cb(null);
            }
        }, 150);
    }

    function salin_satu_field_v2(tr_sumber, tr_tujuan, selector) {
        var $src = $(tr_sumber).find(selector).first();
        var $dst = $(tr_tujuan).find(selector).first();
        if ($src.length > 0 && $dst.length > 0) {
            $dst.val($src.val());
        }
    }

    function proses_satu_baris_v2(tr_sumber, cb) {
        cari_baris_kosong_atau_tambah(function (tr_tujuan) {
            if (!tr_tujuan) {
                cb(false);
                return;
            }
            KELAS_FIELD_DISALIN_V2.forEach(function (kelas) {
                salin_satu_field_v2(tr_sumber, tr_tujuan, '.' + kelas);
            });
            salin_satu_field_v2(tr_sumber, tr_tujuan, 'input[name$="[harga_jual]"]');

            var $jumlah_sumber = $(tr_sumber).find('.jumlah_produk');
            var nilai_jumlah = $jumlah_sumber.val() || 1;
            $(tr_tujuan).find('.jumlah_produk').val(nilai_jumlah).trigger('change');

            // Sesuai permintaan: Stok Asal disamakan dengan Jumlah Transfer, Stok Tujuan selalu 0.0
            // (bukan stok asli - field ini di V2 sengaja tidak lewat pencarian produk).
            $(tr_tujuan).find('.label_stok_asal').text(nilai_jumlah);
            $(tr_tujuan).find('.val_stok_asal').val(nilai_jumlah);
            $(tr_tujuan).find('.label_stok_tujuan').text('0.0');
            $(tr_tujuan).find('.val_stok_tujuan').val('0.0');

            salin_satu_field_v2(tr_sumber, tr_tujuan, 'input[name$="[keterangan]"], textarea[name$="[keterangan]"]');

            // effect() milik jQuery UI: tanpa itu (atau kalau melempar galat) proses jangan sampai berhenti
            try {
                if ($.fn.effect) {
                    $(tr_tujuan).effect('highlight', {}, 1500);
                }
            } catch (e) {}
            cb(true);
        });
    }

    function masukkan_hasil_ke_table_v2() {
        if (data_tr_barang_terakhir.length === 0) {
            info_dialog('Tidak ada data', '<p>Tidak ada barang untuk dimasukkan ke tabel.</p>');
            return;
        }
        minta_konfirmasi_header(data_tr_barang_terakhir.length, jalankan_masukkan_v2);
    }

    function jalankan_masukkan_v2(header) {
        $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', true);
        $('#llb_progress').show().text('Menerapkan Dari/Ke Outlet & Gudang ...');
        kunci_posisi_scroll();

        terapkan_header_ke_form(header, function (gagal) {
            if (gagal.length > 0) {
                info_dialog('Gagal mengisi Outlet / Gudang',
                    '<p>Proses dibatalkan, tidak ada barang yang dimasukkan. Field berikut tidak bisa diisi:</p>' +
                    daftar_html(gagal) +
                    '<p>Kemungkinan pilihan tersimpan tidak ada di daftar pilihan form ini. Cek lagi, lalu klik ' +
                    '"Ganti dengan Pilihan di Form" kalau perlu.</p>', true);
                $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                lepas_kunci_scroll();
                $('#llb_progress').hide();
                return;
            }
            var idx = 0;
            var total = data_tr_barang_terakhir.length;
            var gagal_salin = [];

            function lanjut() {
                if (idx >= total) {
                    $(TOMBOL_MODAL_LIHAT_BARANG).prop('disabled', false);
                    lepas_kunci_scroll();
                    if (gagal_salin.length > 0) {
                        $('#llb_progress').text('Selesai, tapi ' + gagal_salin.length + ' dari ' + total + ' barang tidak masuk.');
                        info_dialog('Sebagian barang belum masuk ke tabel',
                            '<p><b>' + (total - gagal_salin.length) + '</b> dari <b>' + total + '</b> barang disalin ke tabel.</p>' +
                            '<p>Tidak ada baris kosong untuk barang berikut (tambah baris di halaman gagal):</p>' +
                            daftar_html(gagal_salin.slice(0, 10)) +
                            (gagal_salin.length > 10 ? '<p>... dan ' + (gagal_salin.length - 10) + ' lainnya.</p>' : ''), true);
                        return;
                    }
                    $('#llb_progress').text('Selesai: ' + total + ' barang disalin langsung ke tabel.');
                    setTimeout(tutup_semua_modal, 800);
                    return;
                }
                $('#llb_progress').text('Menyalin barang ' + (idx + 1) + ' dari ' + total + ' ...');
                var data = data_lihat_barang_terakhir[idx] || {};
                proses_satu_baris_v2(data_tr_barang_terakhir[idx], function (berhasil) {
                    if (!berhasil) {
                        gagal_salin.push(data.barcode || ('baris ' + (idx + 1)));
                    }
                    idx++;
                    lanjut();
                });
            }

            lanjut();
        });
    }

    // ---------- Pemasangan tombol (tahan terhadap re-render ajax pada blok Daftar Barang) ----------

    function siapkan_modal_dan_handler() {
        if ($('#modal_lihat_barang').length > 0) {
            return;
        }
        $('<style>').text(STYLE).appendTo('head');
        $('body').append(MODAL_HTML);
        $('body').append(DIALOG_HTML);

        $(document).on('click', '#overlay_modal_umum', tutup_semua_modal);

        $(document).on('click', '#bt_lihat_barang', buka_modal_lihat_barang);
        $(document).on('click', '#bt_pembelian', buka_modal_pembelian);
        $(document).on('click', '#llb_btn_tampilkan', tampilkan_dari_input_link);
        $(document).on('click', '#llb_btn_simpan_header', simpan_header_ke_localstorage);
        $(document).on('click', '#llb_btn_masukkan_v2', masukkan_sesuai_sumber);
        $(document).on('click', '#llb_btn_tutup, #llb_btn_close_x', tutup_semua_modal);

        $(document).on('keydown', '#llb_input_link', function (e) {
            if (e.which === 13) {
                if (!$('#llb_btn_tampilkan').prop('disabled')) {
                    tampilkan_dari_input_link();
                }
                return false;
            }
        });
    }

    function cari_wrapper_tombol() {
        var wrapper = $('#pemindahan_barang_detail .additional_button_wrapper').first();
        if (wrapper.length === 0) {
            wrapper = $('.additional_button_wrapper').first();
        }
        return wrapper;
    }

    function pastikan_tombol_ada() {
        var wrapper = cari_wrapper_tombol();
        if (wrapper.length === 0) {
            return;
        }

        if ($('#bt_lihat_barang').length === 0) {
            wrapper.append(
                '<div class="additional_button" id="wrapper_bt_lihat_barang">' +
                    '<div id="bt_lihat_barang">' +
                        '<span class="fa fa-table" aria-hidden="true" style="color:#198754;font-size:14px"></span> Log Data Pemindahan' +
                    '</div>' +
                '</div>'
            );
        }

        if ($('#bt_pembelian').length === 0) {
            wrapper.append(
                '<div class="additional_button" id="wrapper_bt_pembelian">' +
                    '<div id="bt_pembelian">' +
                        '<span class="fa fa-shopping-cart" aria-hidden="true" style="color:#0d6efd;font-size:14px"></span> Data Pembelian' +
                    '</div>' +
                '</div>'
            );
        }
    }

    $(function () {
        buang_header_lama();
        siapkan_modal_dan_handler();
        pastikan_tombol_ada();

        var observer = new MutationObserver(function () {
            pastikan_tombol_ada();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
