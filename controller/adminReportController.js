import Order from '../model/orderModel.js';
import User from '../model/userModel.js';
import Product from '../model/productModel.js';
import Coupon from '../model/couponModel.js';
import Offer from '../model/offerModel.js';
import Referral from '../model/referralModel.js';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import moment from 'moment';

// Helper to construct match conditions based on filters
const buildMatchConditions = (query) => {
    let match = {};

    // Date Filtering
    if (query.dateFilter) {
        const now = moment();
        switch (query.dateFilter) {
            case 'daily':
                match.orderDate = { $gte: now.startOf('day').toDate(), $lte: now.endOf('day').toDate() };
                break;
            case 'weekly':
                match.orderDate = { $gte: now.startOf('week').toDate(), $lte: now.endOf('week').toDate() };
                break;
            case 'monthly':
                match.orderDate = { $gte: now.startOf('month').toDate(), $lte: now.endOf('month').toDate() };
                break;
            case 'yearly':
                match.orderDate = { $gte: now.startOf('year').toDate(), $lte: now.endOf('year').toDate() };
                break;
            case 'custom':
                if (query.startDate && query.endDate) {
                    const start = moment(query.startDate).startOf('day').toDate();
                    const end = moment(query.endDate).endOf('day').toDate();
                    if (start <= end) {
                        match.orderDate = { $gte: start, $lte: end };
                    }
                }
                break;
        }
    }

    // Payment Method Filtering
    if (query.paymentMethod && query.paymentMethod !== 'all') {
        match.paymentMethod = query.paymentMethod;
    }

    // Exclude Failed and Payment Pending orders from all reports and metrics
    match.paymentStatus = { $ne: 'Failed' };
    match.orderStatus = { $ne: 'Payment Pending' };

    return match;
};

// Compute status filter condition for the unwound products
const getProductStatusMatch = (statusFilter) => {
    const matchStage = {};
    if (statusFilter && statusFilter !== 'All Statuses' && statusFilter !== 'all') {
        if (statusFilter === 'Returned') {
            matchStage["products.orderStatus"] = { $in: ["Returned", "Refund Processed"] };
        } else {
            matchStage["products.orderStatus"] = statusFilter;
        }
    }
    return matchStage;
};

const getReportData = async (query, isExport = false) => {
    const page = parseInt(query.page) || 1;
    const limit = isExport ? 10000 : 10; // Load all for export, paginated for UI
    const skip = (page - 1) * limit;

    const orderMatch = buildMatchConditions(query);
    const productMatch = getProductStatusMatch(query.status);
    const searchRegex = query.search ? new RegExp(query.search, 'i') : null;

    console.log("===================================");
    console.log("Status Filter:", query.status);
    console.log("Match Stage:", productMatch);
    console.log("===================================");

    // Base Pipeline for overall metrics
    const metricsPipeline = [
        { $match: orderMatch },
        { $unwind: "$products" },
        { $match: productMatch },
        {
            $group: {
                _id: null,
                totalItems: { $sum: 1 },
                grossSales: {
                    $sum: {
                        $cond: [
                            {
                                $or: [
                                    { $in: ["$paymentStatus", ["Paid", "Refunded"]] },
                                    { $and: [{ $eq: ["$paymentMethod", "COD"] }, { $eq: ["$products.orderStatus", "Delivered"] }] }
                                ]
                            },
                            "$products.productFinalPaidPrice",
                            0
                        ]
                    }
                },
                refunds: {
                    $sum: {
                        $cond: [
                            { $gt: ["$products.refundAmountProcessed", 0] },
                            "$products.refundAmountProcessed",
                            0
                        ]
                    }
                },
                couponDiscount: { $sum: "$products.couponDiscountShare" },
                offerDiscount: { $sum: { $add: ["$products.productOfferDiscount", "$products.categoryOfferDiscount", "$products.offerDiscountShare"] } },
                referralDiscount: { $sum: "$products.referralDiscountShare" },
                deliveredCount: { $sum: { $cond: [{ $eq: ["$products.orderStatus", "Delivered"] }, 1, 0] } },
                cancelledCount: { $sum: { $cond: [{ $eq: ["$products.orderStatus", "Cancelled"] }, 1, 0] } },
                returnedCount: { $sum: { $cond: [{ $in: ["$products.orderStatus", ["Returned", "Refund Processed"]] }, 1, 0] } }
            }
        }
    ];

    const metricsData = await Order.aggregate(metricsPipeline);
    const metrics = metricsData[0] || {
        totalItems: 0, grossSales: 0, refunds: 0, couponDiscount: 0, offerDiscount: 0,
        referralDiscount: 0, deliveredCount: 0, cancelledCount: 0, returnedCount: 0
    };

    const netRevenue = metrics.grossSales - metrics.refunds;
    const totalDiscounts = (metrics.couponDiscount || 0) + (metrics.offerDiscount || 0) + (metrics.referralDiscount || 0);

    const netOrders = await Order.countDocuments(orderMatch);

    let userMatch = {};
    if (orderMatch.orderDate) {
        userMatch.createdAt = orderMatch.orderDate;
    }
    const userCount = await User.countDocuments(userMatch);

    // Orders Today
    const startOfToday = moment().startOf('day').toDate();
    const endOfToday = moment().endOf('day').toDate();
    const ordersTodayResult = await Order.aggregate([
        { $match: { orderDate: { $gte: startOfToday, $lte: endOfToday }, paymentStatus: { $ne: 'Failed' }, orderStatus: { $ne: 'Payment Pending' } } },
        { $unwind: "$products" },
        { $match: { "products.orderStatus": { $nin: ["Cancelled", "Returned", "Refund Processed"] } } },
        { $group: { _id: "$_id" } },
        { $count: "count" }
    ]);
    const ordersTodayCount = ordersTodayResult[0] ? ordersTodayResult[0].count : 0;

    // Total Products
    const totalProducts = await Product.countDocuments({ deleted_at: null });

    // Top 10 Products
    const topProductsPipeline = [
        { $match: orderMatch },
        { $unwind: "$products" },
        { $match: productMatch },
        { $match: { "products.orderStatus": "Delivered" } },
        {
            $group: {
                _id: "$products.productId",
                productName: { $first: "$products.productName" },
                quantitySold: { $sum: "$products.quantity" },
                revenue: { $sum: "$products.productFinalPaidPrice" }
            }
        },
        { $sort: { quantitySold: -1 } },
        { $limit: 10 }
    ];
    const topProducts = await Order.aggregate(topProductsPipeline);

    // Top 10 Categories
    const topCategoriesPipeline = [
        { $match: orderMatch },
        { $unwind: "$products" },
        { $match: productMatch },
        { $match: { "products.orderStatus": "Delivered" } },
        {
            $lookup: {
                from: 'products',
                localField: 'products.productId',
                foreignField: '_id',
                as: 'productDetails'
            }
        },
        { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: false } },
        {
            $lookup: {
                from: 'categories',
                localField: 'productDetails.category',
                foreignField: '_id',
                as: 'categoryDetails'
            }
        },
        { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: false } },
        {
            $group: {
                _id: "$categoryDetails._id",
                categoryName: { $first: "$categoryDetails.name" },
                quantitySold: { $sum: "$products.quantity" },
                revenue: { $sum: "$products.productFinalPaidPrice" }
            }
        },
        { $sort: { quantitySold: -1 } },
        { $limit: 10 }
    ];
    const topCategories = await Order.aggregate(topCategoriesPipeline);

    // Top 10 Brands
    const topBrandsPipeline = [
        { $match: orderMatch },
        { $unwind: "$products" },
        { $match: productMatch },
        { $match: { "products.orderStatus": "Delivered" } },
        {
            $lookup: {
                from: 'products',
                localField: 'products.productId',
                foreignField: '_id',
                as: 'productDetails'
            }
        },
        { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: false } },
        {
            $lookup: {
                from: 'brands',
                localField: 'productDetails.brand',
                foreignField: '_id',
                as: 'brandDetails'
            }
        },
        { $unwind: { path: "$brandDetails", preserveNullAndEmptyArrays: false } },
        {
            $group: {
                _id: "$brandDetails._id",
                brandName: { $first: "$brandDetails.name" },
                quantitySold: { $sum: "$products.quantity" },
                revenue: { $sum: "$products.productFinalPaidPrice" }
            }
        },
        { $sort: { quantitySold: -1 } },
        { $limit: 10 }
    ];
    const topBrands = await Order.aggregate(topBrandsPipeline);

    let searchMatch = {};
    if (searchRegex) {
        searchMatch = {
            $or: [
                { "orderId": searchRegex },
                { "products.productName": searchRegex }
            ]
        };
    }

    const tablePipeline = [
        { $match: orderMatch },
        { $unwind: "$products" },
        { $match: productMatch },
        { $match: searchMatch },
        { $sort: { orderDate: -1 } },
        {
            $facet: {
                metadata: [{ $count: "total" }],
                data: [
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'userId',
                            foreignField: '_id',
                            as: 'user'
                        }
                    },
                    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            orderId: 1,
                            orderDate: 1,
                            paymentMethod: 1,
                            customerName: { $ifNull: ["$user.name", "Guest"] },
                            customerEmail: { $ifNull: ["$user.email", "N/A"] },
                            productName: "$products.productName",
                            quantity: "$products.quantity",
                            mrp: { $multiply: ["$products.mrp", "$products.quantity"] },
                            sellingPrice: { $multiply: ["$products.salePrice", "$products.quantity"] },
                            couponDiscount: "$products.couponDiscountShare",
                            offerDiscount: { $add: ["$products.productOfferDiscount", "$products.categoryOfferDiscount", "$products.offerDiscountShare"] },
                            refundAmount: { $ifNull: ["$products.refundAmountProcessed", 0] },
                            netAmount: "$products.productFinalPaidPrice",
                            status: "$products.orderStatus",
                            returnStatus: { $ifNull: ["$products.returnStatus", "None"] },
                            deliveredDate: {
                                $reduce: {
                                    input: "$products.trackingTimeline",
                                    initialValue: null,
                                    in: {
                                        $cond: [
                                            { $eq: ["$$this.status", "Delivered"] },
                                            "$$this.timestamp",
                                            "$$value"
                                        ]
                                    }
                                }
                            }
                        }
                    }
                ]
            }
        }
    ];

    const tableResult = await Order.aggregate(tablePipeline);
    const orders = tableResult[0]?.data || [];
    const totalRecords = tableResult[0]?.metadata[0]?.total || 0;
    const totalPages = Math.ceil(totalRecords / limit);

    const paymentDistPipeline = [
        { $match: orderMatch },
        {
            $group: {
                _id: "$paymentMethod",
                count: { $sum: 1 }
            }
        }
    ];
    const paymentDistData = await Order.aggregate(paymentDistPipeline);

    const ordersForLedger = await Order.find(orderMatch).populate('userId', 'name').lean();
    let transactions = [];
    let runningBalance = 0;

    ordersForLedger.forEach(order => {
        order.products.forEach(prod => {
            // Apply Status Filter to Ledger Inner Loop dynamically
            if (query.status && query.status !== 'All Statuses' && query.status !== 'all') {
                if (query.status === 'Returned') {
                    if (!['Returned', 'Refund Processed'].includes(prod.orderStatus)) return;
                } else {
                    if (prod.orderStatus !== query.status) return;
                }
            }

            // Credit: Delivered product revenue
            if (prod.orderStatus === 'Delivered' && prod.productFinalPaidPrice > 0) {
                let creditDate = order.orderDate;
                const deliveryEntry = prod.trackingTimeline?.find(t => t.status === 'Delivered');
                if (deliveryEntry) creditDate = deliveryEntry.timestamp;
                
                transactions.push({
                    date: creditDate, orderId: order.orderId, customer: order.userId?.name || 'Guest',
                    description: `Product Sale - ${prod.productName}`, type: 'Credit',
                    amount: prod.productFinalPaidPrice, timestamp: new Date(creditDate).getTime()
                });
            }

            // Debit: Actual refund processed
            if (prod.refundAmountProcessed && prod.refundAmountProcessed > 0) {
                let refundDate = order.orderDate;
                const refundEntry = prod.trackingTimeline?.find(t => t.status === 'Refund Processed' || t.status === 'Cancelled' || t.status === 'Returned');
                if (refundEntry) refundDate = refundEntry.timestamp;
                
                transactions.push({
                    date: refundDate, orderId: order.orderId, customer: order.userId?.name || 'Guest',
                    description: `Refund Issued - ${prod.productName}`, type: 'Debit',
                    amount: prod.refundAmountProcessed, timestamp: new Date(refundDate).getTime()
                });
            }
        });
    });

    transactions.sort((a, b) => a.timestamp - b.timestamp);
    
    // Calculate running balance for transactions
    transactions.forEach(t => {
        if (t.type === 'Credit') runningBalance += t.amount;
        else runningBalance -= t.amount;
        t.balance = runningBalance;
    });

    // Build trendData directly from the orders to match the card metrics exactly
    const trendMap = {};
    ordersForLedger.forEach(order => {
        const dateStr = new Date(order.orderDate).toISOString().split('T')[0];
        if (!trendMap[dateStr]) trendMap[dateStr] = { _id: dateStr, revenue: 0, orders: new Set() };
        
        order.products.forEach(prod => {
            // Apply Status Filter
            if (query.status && query.status !== 'All Statuses' && query.status !== 'all') {
                if (query.status === 'Returned') {
                    if (!['Returned', 'Refund Processed'].includes(prod.orderStatus)) return;
                } else {
                    if (prod.orderStatus !== query.status) return;
                }
            }

            // Gross Sales Logic
            let prodGross = 0;
            if (['Paid', 'Refunded'].includes(order.paymentStatus) || 
                (order.paymentMethod === 'COD' && prod.orderStatus === 'Delivered')) {
                prodGross = prod.productFinalPaidPrice || 0;
            }

            // Refunds Logic
            let prodRefund = 0;
            if (prod.refundAmountProcessed && prod.refundAmountProcessed > 0) {
                prodRefund = prod.refundAmountProcessed;
            }

            trendMap[dateStr].revenue += (prodGross - prodRefund);
            trendMap[dateStr].orders.add(order.orderId);
        });
    });

    const trendData = Object.values(trendMap).map(d => ({
        _id: d._id,
        revenue: d.revenue,
        orders: d.orders.size
    })).sort((a, b) => a._id.localeCompare(b._id));

    transactions.sort((a, b) => b.timestamp - a.timestamp);
    const recentTransactions = transactions.slice(0, 10);

    return {
        metrics: {
            totalOrders: totalRecords, 
            grossSales: metrics.grossSales,
            totalDiscounts,
            couponDiscount: metrics.couponDiscount,
            offerDiscount: metrics.offerDiscount,
            referralDiscount: metrics.referralDiscount,
            refunds: metrics.refunds,
            netRevenue: netRevenue, 
            deliveredCount: metrics.deliveredCount,
            cancelledCount: metrics.cancelledCount,
            returnedCount: metrics.returnedCount,

            // New Dashboard Metrics
            totalRevenue: netRevenue,
            netOrders,
            userCount,
            ordersTodayCount,
            totalProducts
        },
        topProducts,
        topCategories,
        topBrands,
        orders,
        currentPage: page,
        totalPages,
        chartData: {
            trend: trendData,
            payment: paymentDistData
        },
        recentTransactions
    };
};

export const loadSalesReport = async (req, res) => {
    try {
        const data = await getReportData(req.query, false);


        res.render('admin/salesReport', {
            layout: 'admin',
            activePage: 'reports',
            query: req.query,
            metrics: data.metrics,
            orders: data.orders,
            currentPage: data.currentPage,
            totalPages: data.totalPages,
            topProducts: data.topProducts,
            topCategories: data.topCategories,
            topBrands: data.topBrands,
            recentTransactions: data.recentTransactions,
            chartData: JSON.stringify(data.chartData),
            todayDate: new Date().toISOString().split('T')[0]
        });

    } catch (error) {
        console.error("loadSalesReport error:", error);
        res.status(500).send("Internal Server Error");
    }
};

export const exportPdfReport = async (req, res) => {
    try {
        const data = await getReportData(req.query, true);

        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-disposition', 'attachment; filename=sales_report.pdf');
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        // Header
        doc.fontSize(20).text('Tymora Sales Report', { align: 'center' });
        doc.fontSize(10).text(`Generated: ${moment().format('MMMM Do YYYY, h:mm a')}`, { align: 'center' });
        doc.moveDown(2);

        // Summary
        doc.fontSize(14).text('Summary Metrics', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11).text(`Total Orders: ${data.metrics.totalOrders}`);
        doc.text(`Gross Sales: Rs. ${data.metrics.grossSales.toFixed(2)}`);
        doc.text(`Total Discounts: Rs. ${data.metrics.totalDiscounts.toFixed(2)}`);
        doc.text(`Refunds: Rs. ${data.metrics.refunds.toFixed(2)}`);
        doc.font('Helvetica-Bold').text(`Net Revenue: Rs. ${data.metrics.netRevenue.toFixed(2)}`).font('Helvetica');
        doc.moveDown(2);

        // Orders Table header
        doc.fontSize(14).text('Order Details', { underline: true });
        doc.moveDown(1);

        const colOrder = 30;
        const colDate = 130;
        const colCust = 200;
        const colProd = 320;
        const colQty = 450;
        const colGross = 480;
        const colSell = 530;
        const colNet = 590;
        const colRefund = 650;
        const colStatus = 710;

        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('Order ID', colOrder, doc.y, { continued: false });
        doc.text('Date', colDate, doc.y - 11);
        doc.text('Customer', colCust, doc.y - 11);
        doc.text('Product', colProd, doc.y - 11);
        doc.text('Qty', colQty, doc.y - 11);
        doc.text('MRP', colGross, doc.y - 11);
        doc.text('Sell Price', colSell, doc.y - 11);
        doc.text('Final Amt', colNet, doc.y - 11);
        doc.text('Refund Amt', colRefund, doc.y - 11);
        doc.text('Status', colStatus, doc.y - 11);
        doc.moveTo(30, doc.y + 5).lineTo(780, doc.y + 5).stroke();
        doc.moveDown(1);

        doc.font('Helvetica').fontSize(8);
        data.orders.forEach((o, index) => {
            if (doc.y > 500) {
                doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
            }
            const y = doc.y;
            doc.text(o.orderId, colOrder, y);
            doc.text(moment(o.orderDate).format('YYYY-MM-DD'), colDate, y);

            let custName = o.customerName || '';
            if (custName.length > 18) custName = custName.substring(0, 15) + '...';
            doc.text(custName, colCust, y);

            let prodName = o.productName || '';
            if (prodName.length > 25) prodName = prodName.substring(0, 22) + '...';
            doc.text(prodName, colProd, y);

            doc.text(o.quantity.toString(), colQty, y);
            doc.text(`Rs. ${o.mrp.toFixed(2)}`, colGross, y);
            doc.text(`Rs. ${(o.sellingPrice || 0).toFixed(2)}`, colSell, y);
            doc.text(`Rs. ${o.netAmount.toFixed(2)}`, colNet, y);
            doc.text(`Rs. ${o.refundAmount.toFixed(2)}`, colRefund, y);
            doc.text(o.status, colStatus, y);
            doc.moveDown(1.5);
        });

        // Add page numbers
        const range = doc.bufferedPageRange ? doc.bufferedPageRange() : { count: 1 };
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).text(`Page ${i + 1} of ${range.count}`, 0, 560, { align: 'center' });
        }

        doc.end();
    } catch (error) {
        console.error("PDF generation error:", error);
        res.status(500).send("Error generating PDF");
    }
};

export const exportExcelReport = async (req, res) => {
    try {
        const data = await getReportData(req.query, true);
        const workbook = new ExcelJS.Workbook();

        // Sheet 1: Summary
        const summarySheet = workbook.addWorksheet('Sales Summary');
        summarySheet.columns = [
            { header: 'Metric', key: 'metric', width: 25 },
            { header: 'Value', key: 'value', width: 20 }
        ];
        summarySheet.addRows([
            { metric: 'Total Orders', value: data.metrics.totalOrders },
            { metric: 'Gross Sales (Rs)', value: data.metrics.grossSales },
            { metric: 'Coupon Discounts (Rs)', value: data.metrics.couponDiscount },
            { metric: 'Offer Discounts (Rs)', value: data.metrics.offerDiscount },
            { metric: 'Referral Discounts (Rs)', value: data.metrics.referralDiscount },
            { metric: 'Refunds (Rs)', value: data.metrics.refunds },
            { metric: 'Net Revenue (Rs)', value: data.metrics.netRevenue },
            { metric: 'Delivered Items', value: data.metrics.deliveredCount },
            { metric: 'Cancelled Items', value: data.metrics.cancelledCount },
            { metric: 'Returned Items', value: data.metrics.returnedCount }
        ]);

        // Sheet 2: Orders
        const orderSheet = workbook.addWorksheet('Orders');
        orderSheet.columns = [
            { header: 'Order ID', key: 'id', width: 20 },
            { header: 'Order Date', key: 'date', width: 15 },
            { header: 'Customer Name', key: 'customer', width: 25 },
            { header: 'Customer Email', key: 'email', width: 30 },
            { header: 'Products', key: 'product', width: 40 },
            { header: 'Quantity', key: 'qty', width: 10 },
            { header: 'Payment Method', key: 'method', width: 18 },
            { header: 'Subtotal (MRP)', key: 'mrp', width: 15 },
            { header: 'Selling Price', key: 'sellingPrice', width: 15 },
            { header: 'Coupon Discount', key: 'couponDisc', width: 16 },
            { header: 'Offer Discount', key: 'offerDisc', width: 16 },
            { header: 'Final Amount', key: 'net', width: 15 },
            { header: 'Order Status', key: 'status', width: 18 },
            { header: 'Refund Amount', key: 'refund', width: 15 },
            { header: 'Delivered Date', key: 'delDate', width: 18 },
            { header: 'Return Status', key: 'returnStatus', width: 18 }
        ];

        // Style headers
        orderSheet.getRow(1).font = { bold: true };
        summarySheet.getRow(1).font = { bold: true };

        data.orders.forEach(o => {
            orderSheet.addRow({
                id: o.orderId,
                date: moment(o.orderDate).format('YYYY-MM-DD'),
                customer: o.customerName,
                email: o.customerEmail,
                product: o.productName,
                qty: o.quantity,
                method: o.paymentMethod,
                mrp: o.mrp,
                sellingPrice: o.sellingPrice || 0,
                couponDisc: o.couponDiscount,
                offerDisc: o.offerDiscount,
                net: o.netAmount,
                status: o.status,
                refund: o.refundAmount || 0,
                delDate: o.deliveredDate ? moment(o.deliveredDate).format('YYYY-MM-DD HH:mm') : 'N/A',
                returnStatus: o.returnStatus !== 'None' ? (o.returnStatus === 'Return Requested' ? 'Requested' : (o.returnStatus === 'Return Rejected' ? 'Rejected' : o.returnStatus)) : 'N/A'
            });
        });

        // Sheet 3: Top Products
        const prodSheet = workbook.addWorksheet('Top Products');
        prodSheet.columns = [
            { header: 'Product Name', key: 'name', width: 40 },
            { header: 'Quantity Sold', key: 'qty', width: 15 },
            { header: 'Revenue (Rs)', key: 'revenue', width: 20 }
        ];
        data.topProducts.forEach(p => {
            prodSheet.addRow({ name: p.productName, qty: p.quantitySold, revenue: p.revenue });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Excel generation error:", error);
        res.status(500).send("Error generating Excel file");
    }
};

export const getDashboardData = async (req, res) => {
    try {
        const data = await getReportData(req.query, false);
        res.json({ success: true, data });
    } catch (error) {
        console.error("Dashboard data fetch error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
