// ==UserScript==
// @name         Erzap - Barcode (Pemindahan Barang)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Tambah tombol "Barcode" di area bawah tabel Daftar Barang Pemindahan Barang. Tombol sementara: klik menampilkan dialog placeholder, aksi lengkap menyusul.
// @author       You
// @match        https://*.erzap.com/pemindahan_barangs*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// @world        main
// ==/UserScript==

(function () {
    'use strict';

    var STYLE = [
        '#bt_barcode{cursor:pointer;}',
        '#bc_dialog{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:100001;',
        'background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:16px;',
        'box-sizing:border-box;font-family:Arial, sans-serif;}',
        '#bc_dialog .bc_kotak{background:#fff;border-radius:8px;border-top:4px solid #0d6efd;',
        'box-shadow:0 4px 24px rgba(0,0,0,0.35);width:420px;max-width:100%;padding:16px;',
        'box-sizing:border-box;}',
        '#bc_dialog_judul{font-weight:bold;font-size:16px;margin-bottom:10px;}',
        '#bc_dialog_isi{font-size:13px;color:#333;}',
        '#bc_dialog .bc_tombol{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;}',
        '#bc_dialog .bc_tombol button{padding:8px 14px;border-radius:4px;border:1px solid #ccc;',
        'background:#f5f5f5;cursor:pointer;font-size:14px;}'
    ].join('');

    var DIALOG_HTML =
        '<div id="bc_dialog"><div class="bc_kotak">' +
            '<div id="bc_dialog_judul">Barcode</div>' +
            '<div id="bc_dialog_isi"></div>' +
            '<div class="bc_tombol">' +
                '<button type="button" id="bc_dialog_ok">OK</button>' +
            '</div>' +
        '</div></div>';

    function tampilkan_dialog(judul, isi_html) {
        $('#bc_dialog_judul').text(judul || '');
        $('#bc_dialog_isi').html(isi_html || '');
        $('#bc_dialog').css('display', 'flex');
    }

    function tutup_dialog() {
        $('#bc_dialog').css('display', 'none');
    }

    function siapkan_dialog() {
        if ($('#bc_dialog').length > 0) {
            return;
        }
        $('<style>').text(STYLE).appendTo('head');
        $('body').append(DIALOG_HTML);
        $(document).on('click', '#bc_dialog_ok', tutup_dialog);
    }

    function klik_barcode() {
        // Placeholder: aksi tombol "Barcode" menyusul (cetak barcode / scan kamera).
        tampilkan_dialog('Barcode',
            '<p>Tombol ini belum punya aksi.</p>' +
            '<p>Fitur barcode (cetak / scan) akan diisi pada versi berikutnya.</p>');
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
        if ($('#bt_barcode').length === 0) {
            wrapper.append(
                '<div class="additional_button" id="wrapper_bt_barcode">' +
                    '<div id="bt_barcode">' +
                        '<span class="fa fa-barcode" aria-hidden="true" style="color:#0d6efd;font-size:14px"></span> Barcode' +
                    '</div>' +
                '</div>'
            );
        }
    }

    $(function () {
        siapkan_dialog();
        pastikan_tombol_ada();
        $(document).on('click', '#bt_barcode', klik_barcode);

        var observer = new MutationObserver(function () {
            pastikan_tombol_ada();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
