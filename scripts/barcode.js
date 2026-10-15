// ==UserScript==
// @name         Erzap - Barcode (Pemindahan Barang)
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  [v2.0.0] Ganti dari satu tombol di bawah tabel -> link "Cetak Barcode" di tiap baris produk Daftar Barang Pemindahan, meniru fitur cetak barcode native di Faktur Pembelian (modal jumlah label + SN kalau produk pakai SN, lalu AJAX ke /produks/get_zpl_raw/new dan kirim ke printer via write_raw_printer_zpl). Modal dibuat sendiri (prefix bc_) supaya tidak gantung ke openBarcodeModal/#barcodeModal yang belum pasti ada di halaman ini. idproduk/is_sn/jumlah diambil dari input tersembunyi baris (searching_barcode_produk_id, produk_is_sn, jumlah_produk).
// @author       You
// @match        https://*.erzap.com/pemindahan_barangs*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=erzap.com
// @grant        none
// @world        main
// ==/UserScript==

(function () {
    'use strict';

    var STYLE = [
        '#bc_dialog{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:100001;',
        'background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:16px;',
        'box-sizing:border-box;font-family:Arial, sans-serif;}',
        '#bc_dialog .bc_kotak{background:#fff;border-radius:8px;border-top:4px solid #0d6efd;',
        'box-shadow:0 4px 24px rgba(0,0,0,0.35);width:360px;max-width:100%;padding:16px;',
        'box-sizing:border-box;}',
        '#bc_dialog_judul{font-weight:bold;font-size:16px;margin-bottom:10px;}',
        '#bc_dialog .bc_field{margin-bottom:10px;}',
        '#bc_dialog .bc_field label{display:block;font-size:13px;margin-bottom:4px;}',
        '#bc_dialog .bc_field input[type=number],#bc_dialog .bc_field input[type=text]{width:100%;height:30px;box-sizing:border-box;padding:4px 8px;border:1px solid #ccc;border-radius:4px;}',
        '#bc_dialog .bc_tombol{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;}',
        '#bc_dialog .bc_tombol button{padding:8px 14px;border-radius:4px;border:1px solid #ccc;',
        'background:#f5f5f5;cursor:pointer;font-size:14px;}',
        '#bc_dialog .bc_tombol .bc_primary{background:#0d6efd;color:#fff;border-color:#0d6efd;}',
        '.bc_print_barcode{cursor:pointer;white-space:nowrap;margin-left:6px;}'
    ].join('');

    var DIALOG_HTML =
        '<div id="bc_dialog"><div class="bc_kotak">' +
            '<div id="bc_dialog_judul">Cetak Barcode</div>' +
            '<input type="hidden" id="bc_idproduk">' +
            '<div class="bc_field">' +
                '<label>Jumlah Label</label>' +
                '<input type="number" id="bc_jumlah" min="1" value="1">' +
            '</div>' +
            '<div class="bc_field" id="bc_sn_wrap" style="display:none">' +
                '<label>Serial Number</label>' +
                '<input type="text" id="bc_sn">' +
            '</div>' +
            '<div id="bc_status" style="font-size:12px;color:#c00;min-height:16px"></div>' +
            '<div class="bc_tombol">' +
                '<button type="button" id="bc_dialog_cancel">Cancel</button>' +
                '<button type="button" id="bc_dialog_print" class="bc_primary">Print</button>' +
            '</div>' +
        '</div></div>';

    function siapkanDialog() {
        if ($('#bc_dialog').length > 0) {
            return;
        }
        $('<style>').text(STYLE).appendTo('head');
        $('body').append(DIALOG_HTML);

        $(document).on('click', '#bc_dialog_cancel', function () {
            $('#bc_dialog').css('display', 'none');
        });

        $(document).on('click', '#bc_dialog_print', function () {
            var idproduk = $('#bc_idproduk').val();
            var jumlah = $('#bc_jumlah').val();
            var sn = $('#bc_sn_wrap').is(':visible') ? $('#bc_sn').val() : '';

            if (!jumlah || jumlah <= 0) {
                $('#bc_status').text('Jumlah label harus diisi.');
                return;
            }
            if (typeof window.write_raw_printer_zpl !== 'function') {
                $('#bc_status').text('Fungsi printer (write_raw_printer_zpl) tidak ditemukan di halaman ini.');
                return;
            }

            var $btn = $('#bc_dialog_print');
            $btn.prop('disabled', true).text('Printing...');
            $('#bc_status').text('');

            $.ajax({
                url: '/produks/get_zpl_raw/new',
                method: 'GET',
                data: { idproduk: idproduk, serial_number: sn, total_label: jumlah },
                success: function (response) {
                    if (response.status == 1) {
                        window.write_raw_printer_zpl(response.zpl_raw, response.printer_name, '', 1, true, null, false);
                        $btn.text('Print Sukses');
                        setTimeout(function () {
                            $('#bc_dialog').css('display', 'none');
                            $btn.prop('disabled', false).text('Print');
                        }, 1500);
                    } else {
                        $('#bc_status').text(response.msg || 'Gagal mengambil data barcode.');
                        $btn.prop('disabled', false).text('Print');
                    }
                },
                error: function () {
                    $('#bc_status').text('Internal Server Error.');
                    $btn.prop('disabled', false).text('Print');
                }
            });
        });
    }

    function bukaDialog(idproduk, isSn, jumlah, sn) {
        $('#bc_idproduk').val(idproduk);
        $('#bc_jumlah').val(jumlah || 1);
        $('#bc_status').text('');
        $('#bc_dialog_print').prop('disabled', false).text('Print');
        if (isSn === 'true') {
            $('#bc_sn_wrap').show();
            $('#bc_sn').val(sn || '');
        } else {
            $('#bc_sn_wrap').hide();
            $('#bc_sn').val('');
        }
        $('#bc_dialog').css('display', 'flex');
    }

    function pasangLinkBarcode() {
        $('tr[id^="tr_"]').each(function () {
            var tr = $(this);
            if (tr.find('.bc_print_barcode').length > 0) {
                return;
            }

            var idproduk = tr.find('input.searching_barcode_produk_id').first().val()
                || tr.find('input.data_produk_id').first().val();
            if (!idproduk) {
                return;
            }

            var isSn = tr.find('input.produk_is_sn').first().val() || 'false';
            var jumlah = tr.find('input.jumlah_produk').first().val() || '1';
            var sn = tr.find('input.searching_sn').first().val() || '';

            var targetTd = tr.find('td').last();
            if (targetTd.length === 0) {
                return;
            }

            var link = $(
                '<a href="#" class="bc_print_barcode" title="Cetak Barcode">' +
                    '<i class="fa fa-print" aria-hidden="true" style="font-size:12px"></i> Cetak Barcode' +
                '</a>'
            );
            link.on('click', function (e) {
                e.preventDefault();
                bukaDialog(idproduk, isSn, jumlah, sn);
            });
            targetTd.append(link);
        });
    }

    $(function () {
        siapkanDialog();
        pasangLinkBarcode();

        var observer = new MutationObserver(function () {
            pasangLinkBarcode();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
