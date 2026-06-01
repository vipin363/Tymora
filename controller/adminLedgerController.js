import Order from '../model/orderModel.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import moment from 'moment';

export const loadLedgerBook = async (req, res) => {
    try {
        const { startDate, endDate, type } = req.query;
        
        let matchStage = {};
        if (startDate && endDate) {
            matchStage.orderDate = {
                $gte: moment(startDate).startOf('day').toDate(),
                $lte: moment(endDate).endOf('day').toDate()
            };
        }

        // Fetch all relevant orders
        const orders = await Order.find(matchStage).populate('userId', 'name email').lean();
        
        let transactions = [];
        let runningBalance = 0;

        orders.forEach(order => {
            order.products.forEach(prod => {
                // Check if payment was collected
                let isPaid = false;
                let paymentDate = order.orderDate;

                if (order.paymentMethod !== 'COD' && order.paymentStatus !== 'Pending' && order.paymentStatus !== 'Failed') {
                    isPaid = true;
                } else if (order.paymentMethod === 'COD' && prod.orderStatus === 'Delivered') {
                    isPaid = true;
                    // Find delivery date
                    const deliveryEntry = prod.trackingTimeline?.find(t => t.status === 'Delivered');
                    if (deliveryEntry) paymentDate = deliveryEntry.timestamp;
                }

                if (isPaid && prod.productFinalPaidPrice > 0) {
                    transactions.push({
                        date: paymentDate,
                        orderId: order.orderId,
                        customer: order.userId?.name || 'Guest',
                        description: `Payment Received (${order.paymentMethod}) - ${prod.productName}`,
                        type: 'Credit',
                        amount: prod.productFinalPaidPrice,
                        timestamp: new Date(paymentDate).getTime()
                    });
                }

                // Check for refunds
                if (prod.refundAmountProcessed > 0) {
                    let refundDate = order.orderDate;
                    const refundEntry = prod.trackingTimeline?.find(t => t.status === 'Refund Processed');
                    if (refundEntry) refundDate = refundEntry.timestamp;

                    transactions.push({
                        date: refundDate,
                        orderId: order.orderId,
                        customer: order.userId?.name || 'Guest',
                        description: `Refund Issued (${prod.refundMethod}) - ${prod.productName}`,
                        type: 'Debit',
                        amount: prod.refundAmountProcessed,
                        timestamp: new Date(refundDate).getTime()
                    });
                }
            });
        });

        // Sort by date ascending to calculate running balance
        transactions.sort((a, b) => a.timestamp - b.timestamp);

        transactions.forEach(t => {
            if (t.type === 'Credit') runningBalance += t.amount;
            else runningBalance -= t.amount;
            t.balance = runningBalance;
        });

        // If filtering by type (Credit/Debit)
        if (type && type !== 'All') {
            transactions = transactions.filter(t => t.type === type);
        }

        // Sort descending for UI presentation
        transactions.sort((a, b) => b.timestamp - a.timestamp);

        res.render('admin/ledgerBook', {
            activePage: 'ledger',
            transactions,
            query: req.query,
            totalBalance: runningBalance,
            todayDate: new Date().toISOString().split('T')[0]
        });

    } catch (err) {
        console.error("loadLedgerBook error:", err);
        res.status(500).send("Internal Server Error");
    }
};

export const exportLedgerExcel = async (req, res) => {
    try {
        const { startDate, endDate, type } = req.query;
        let matchStage = {};
        if (startDate && endDate) {
            matchStage.orderDate = {
                $gte: moment(startDate).startOf('day').toDate(),
                $lte: moment(endDate).endOf('day').toDate()
            };
        }

        const orders = await Order.find(matchStage).populate('userId', 'name').lean();
        let transactions = [];
        let runningBalance = 0;

        orders.forEach(order => {
            order.products.forEach(prod => {
                let isPaid = false;
                let paymentDate = order.orderDate;
                if (order.paymentMethod !== 'COD' && order.paymentStatus !== 'Pending' && order.paymentStatus !== 'Failed') {
                    isPaid = true;
                } else if (order.paymentMethod === 'COD' && prod.orderStatus === 'Delivered') {
                    isPaid = true;
                    const deliveryEntry = prod.trackingTimeline?.find(t => t.status === 'Delivered');
                    if (deliveryEntry) paymentDate = deliveryEntry.timestamp;
                }

                if (isPaid && prod.productFinalPaidPrice > 0) {
                    transactions.push({
                        date: paymentDate, orderId: order.orderId, customer: order.userId?.name || 'Guest',
                        description: `Payment Received (${order.paymentMethod}) - ${prod.productName}`, type: 'Credit',
                        amount: prod.productFinalPaidPrice, timestamp: new Date(paymentDate).getTime()
                    });
                }

                if (prod.refundAmountProcessed > 0) {
                    let refundDate = order.orderDate;
                    const refundEntry = prod.trackingTimeline?.find(t => t.status === 'Refund Processed');
                    if (refundEntry) refundDate = refundEntry.timestamp;
                    transactions.push({
                        date: refundDate, orderId: order.orderId, customer: order.userId?.name || 'Guest',
                        description: `Refund Issued (${prod.refundMethod}) - ${prod.productName}`, type: 'Debit',
                        amount: prod.refundAmountProcessed, timestamp: new Date(refundDate).getTime()
                    });
                }
            });
        });

        transactions.sort((a, b) => a.timestamp - b.timestamp);
        transactions.forEach(t => {
            if (t.type === 'Credit') runningBalance += t.amount;
            else runningBalance -= t.amount;
            t.balance = runningBalance;
        });

        if (type && type !== 'All') {
            transactions = transactions.filter(t => t.type === type);
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Ledger Book');
        sheet.columns = [
            { header: 'Date', key: 'date', width: 20 },
            { header: 'Order ID', key: 'orderId', width: 20 },
            { header: 'Customer', key: 'customer', width: 25 },
            { header: 'Description', key: 'desc', width: 45 },
            { header: 'Type', key: 'type', width: 12 },
            { header: 'Amount (Rs)', key: 'amount', width: 15 },
            { header: 'Balance (Rs)', key: 'balance', width: 18 }
        ];

        sheet.getRow(1).font = { bold: true };
        transactions.forEach(t => {
            sheet.addRow({
                date: moment(t.date).format('YYYY-MM-DD HH:mm'),
                orderId: t.orderId,
                customer: t.customer,
                desc: t.description,
                type: t.type,
                amount: t.amount,
                balance: t.balance
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=ledger_book.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Ledger Excel Export Error:", error);
        res.status(500).send("Error exporting Ledger Book");
    }
};

export const exportLedgerPdf = async (req, res) => {
    try {
        const { startDate, endDate, type } = req.query;
        let matchStage = {};
        if (startDate && endDate) {
            matchStage.orderDate = {
                $gte: moment(startDate).startOf('day').toDate(),
                $lte: moment(endDate).endOf('day').toDate()
            };
        }

        const orders = await Order.find(matchStage).populate('userId', 'name').lean();
        let transactions = [];
        let runningBalance = 0;

        orders.forEach(order => {
            order.products.forEach(prod => {
                let isPaid = false;
                let paymentDate = order.orderDate;
                if (order.paymentMethod !== 'COD' && order.paymentStatus !== 'Pending' && order.paymentStatus !== 'Failed') {
                    isPaid = true;
                } else if (order.paymentMethod === 'COD' && prod.orderStatus === 'Delivered') {
                    isPaid = true;
                    const deliveryEntry = prod.trackingTimeline?.find(t => t.status === 'Delivered');
                    if (deliveryEntry) paymentDate = deliveryEntry.timestamp;
                }

                if (isPaid && prod.productFinalPaidPrice > 0) {
                    transactions.push({
                        date: paymentDate, orderId: order.orderId, customer: order.userId?.name || 'Guest',
                        description: `Payment Received (${order.paymentMethod})`, type: 'Credit',
                        amount: prod.productFinalPaidPrice, timestamp: new Date(paymentDate).getTime()
                    });
                }

                if (prod.refundAmountProcessed > 0) {
                    let refundDate = order.orderDate;
                    const refundEntry = prod.trackingTimeline?.find(t => t.status === 'Refund Processed');
                    if (refundEntry) refundDate = refundEntry.timestamp;
                    transactions.push({
                        date: refundDate, orderId: order.orderId, customer: order.userId?.name || 'Guest',
                        description: `Refund Issued (${prod.refundMethod})`, type: 'Debit',
                        amount: prod.refundAmountProcessed, timestamp: new Date(refundDate).getTime()
                    });
                }
            });
        });

        transactions.sort((a, b) => a.timestamp - b.timestamp);
        transactions.forEach(t => {
            if (t.type === 'Credit') runningBalance += t.amount;
            else runningBalance -= t.amount;
            t.balance = runningBalance;
        });

        if (type && type !== 'All') {
            transactions = transactions.filter(t => t.type === type);
        }

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-disposition', 'attachment; filename=ledger_book.pdf');
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        doc.fontSize(20).text('Ledger Book', { align: 'center' });
        doc.fontSize(10).text(`Generated: ${moment().format('MMMM Do YYYY, h:mm a')}`, { align: 'center' });
        doc.moveDown(2);
        
        doc.fontSize(12).font('Helvetica-Bold').text(`Final Balance: Rs. ${runningBalance.toFixed(2)}`, { align: 'right' });
        doc.moveDown(1);

        const cDate = 30, cID = 110, cDesc = 200, cType = 350, cAmt = 420, cBal = 490;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', cDate, doc.y, { continued: false });
        doc.text('Order ID', cID, doc.y - 12);
        doc.text('Description', cDesc, doc.y - 12);
        doc.text('Type', cType, doc.y - 12);
        doc.text('Amount', cAmt, doc.y - 12);
        doc.text('Balance', cBal, doc.y - 12);
        doc.moveTo(30, doc.y + 5).lineTo(560, doc.y + 5).stroke();
        doc.moveDown(1);

        doc.font('Helvetica').fontSize(9);
        transactions.forEach(t => {
            if (doc.y > 750) doc.addPage();
            const y = doc.y;
            doc.text(moment(t.date).format('DD/MM/YY'), cDate, y);
            doc.text(t.orderId.substring(0,10), cID, y);
            
            let desc = t.description;
            if (desc.length > 25) desc = desc.substring(0, 22) + '...';
            doc.text(desc, cDesc, y);
            
            doc.fillColor(t.type === 'Credit' ? 'green' : 'red').text(t.type, cType, y);
            doc.fillColor('black').text(t.amount.toFixed(2), cAmt, y);
            doc.text(t.balance.toFixed(2), cBal, y);
            doc.moveDown(1.5);
        });

        doc.end();
    } catch (error) {
        console.error("Ledger PDF Export Error:", error);
        res.status(500).send("Error exporting Ledger Book PDF");
    }
};
