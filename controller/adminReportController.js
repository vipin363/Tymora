import Order from '../model/orderModel.js';
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

    return match;
};

// Compute status filter condition for the unwound products
const getProductStatusMatch = (statusFilter) => {
    if (!statusFilter || statusFilter === 'all') return {};
    
    if (statusFilter === 'delivered') return { "products.orderStatus": "Delivered" };
    if (statusFilter === 'cancelled') return { "products.orderStatus": "Cancelled" };
    if (statusFilter === 'returned') return { "products.orderStatus": { $in: ["Returned", "Refund Processed"] } };
    if (statusFilter === 'pending') return { "products.orderStatus": { $nin: ["Delivered", "Cancelled", "Returned", "Refund Processed"] } };
    
    return {};
};

const getReportData = async (query, isExport = false) => {
    const page = parseInt(query.page) || 1;
    const limit = isExport ? 10000 : 10; // Load all for export, paginated for UI
    const skip = (page - 1) * limit;

    const orderMatch = buildMatchConditions(query);
    const productMatch = getProductStatusMatch(query.status);
    const searchRegex = query.search ? new RegExp(query.search, 'i') : null;

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
                            { $in: ["$products.orderStatus", ["Cancelled", "Returned", "Refund Processed"]] },
                            0,
                            { $multiply: ["$products.mrp", "$products.quantity"] }
                        ] 
                    } 
                },
                couponDiscount: { 
                    $sum: { 
                        $cond: [{ $in: ["$products.orderStatus", ["Cancelled", "Returned", "Refund Processed"]] }, 0, "$products.couponDiscountShare"] 
                    } 
                },
                offerDiscount: { 
                    $sum: { 
                        $cond: [{ $in: ["$products.orderStatus", ["Cancelled", "Returned", "Refund Processed"]] }, 0, { $add: ["$products.productOfferDiscount", "$products.categoryOfferDiscount", "$products.offerDiscountShare"] }] 
                    } 
                },
                referralDiscount: { 
                    $sum: { 
                        $cond: [{ $in: ["$products.orderStatus", ["Cancelled", "Returned", "Refund Processed"]] }, 0, "$products.referralDiscountShare"] 
                    } 
                },
                refunds: { $sum: { $cond: [{ $in: ["$products.orderStatus", ["Cancelled", "Returned", "Refund Processed"]] }, "$products.refundAmountProcessed", 0] } },
                deliveredCount: { $sum: { $cond: [{ $eq: ["$products.orderStatus", "Delivered"] }, 1, 0] } },
                cancelledCount: { $sum: { $cond: [{ $eq: ["$products.orderStatus", "Cancelled"] }, 1, 0] } },
                returnedCount: { $sum: { $cond: [{ $in: ["$products.orderStatus", ["Returned", "Refund Processed"]] }, 1, 0] } }
            }
        }
    ];

    const metricsData = await Order.aggregate(metricsPipeline);
    const metrics = metricsData[0] || {
        totalItems: 0, grossSales: 0, couponDiscount: 0, offerDiscount: 0,
        referralDiscount: 0, refunds: 0, deliveredCount: 0, cancelledCount: 0, returnedCount: 0
    };

    const totalDiscounts = (metrics.couponDiscount || 0) + (metrics.offerDiscount || 0) + (metrics.referralDiscount || 0);
    const netRevenue = metrics.grossSales - totalDiscounts;

    // Top 10 Products
    const topProductsPipeline = [
        { $match: orderMatch },
        { $unwind: "$products" },
        { $match: { "products.orderStatus": { $nin: ["Cancelled", "Returned", "Refund Processed"] } } },
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
        { $match: { "products.orderStatus": { $nin: ["Cancelled", "Returned", "Refund Processed"] } } },
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
        { $match: { "products.orderStatus": { $nin: ["Cancelled", "Returned", "Refund Processed"] } } },
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
                            couponDiscount: "$products.couponDiscountShare",
                            offerDiscount: { $add: ["$products.productOfferDiscount", "$products.categoryOfferDiscount", "$products.offerDiscountShare"] },
                            referralDiscount: "$products.referralDiscountShare",
                            refundAmount: "$products.refundAmountProcessed",
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

    const trendPipeline = [
        { $match: orderMatch },
        { $unwind: "$products" },
        { $match: productMatch },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } },
                revenue: { 
                    $sum: { 
                        $cond: [
                            { $and: [{ $eq: ["$products.orderStatus", "Cancelled"] }, { $eq: ["$paymentMethod", "COD"] }] },
                            0,
                            { $subtract: ["$products.productFinalPaidPrice", { $ifNull: ["$products.refundAmountProcessed", 0] }] }
                        ]
                    } 
                },
                orders: { $sum: 1 }
            }
        },
        { $sort: { "_id": 1 } }
    ];
    const trendData = await Order.aggregate(trendPipeline);
    
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

    return {
        metrics: {
            totalOrders: totalRecords,
            grossSales: metrics.grossSales,
            totalDiscounts,
            couponDiscount: metrics.couponDiscount,
            offerDiscount: metrics.offerDiscount,
            referralDiscount: metrics.referralDiscount,
            refunds: metrics.refunds,
            netRevenue,
            deliveredCount: metrics.deliveredCount,
            cancelledCount: metrics.cancelledCount,
            returnedCount: metrics.returnedCount
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
        }
    };
};

export const loadSalesReport = async (req, res) => {
    try {
        const data = await getReportData(req.query, false);


        res.render('admin/salesReport', { layout: 'admin', 
            activePage: 'reports',
            query: req.query,
            metrics: data.metrics,
            orders: data.orders,
            currentPage: data.currentPage,
            totalPages: data.totalPages,
            topProducts: data.topProducts,
            topCategories: data.topCategories,
            topBrands: data.topBrands,
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

        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
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
        
        // Simple table approach for PDFKit in landscape
        const colOrder = 30;
        const colDate = 130;
        const colCust = 200;
        const colProd = 320;
        const colQty = 470;
        const colGross = 510;
        const colDisc = 570;
        const colNet = 630;
        const colStatus = 700;
        
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('Order ID', colOrder, doc.y, { continued: false });
        doc.text('Date', colDate, doc.y - 11);
        doc.text('Customer', colCust, doc.y - 11);
        doc.text('Product', colProd, doc.y - 11);
        doc.text('Qty', colQty, doc.y - 11);
        doc.text('Gross', colGross, doc.y - 11);
        doc.text('Discount', colDisc, doc.y - 11);
        doc.text('Net Amt', colNet, doc.y - 11);
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
            
            const totalDisc = (o.couponDiscount || 0) + (o.offerDiscount || 0) + (o.referralDiscount || 0);
            doc.text(`Rs. ${totalDisc.toFixed(2)}`, colDisc, y);

            doc.text(`Rs. ${o.netAmount.toFixed(2)}`, colNet, y);
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
            { header: 'Coupon Discount', key: 'couponDisc', width: 16 },
            { header: 'Offer Discount', key: 'offerDisc', width: 16 },
            { header: 'Referral Discount', key: 'refDisc', width: 18 },
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
                couponDisc: o.couponDiscount,
                offerDisc: o.offerDiscount,
                refDisc: o.referralDiscount,
                net: o.netAmount,
                status: o.status,
                refund: o.refundAmount || 0,
                delDate: o.deliveredDate ? moment(o.deliveredDate).format('YYYY-MM-DD HH:mm') : 'N/A',
                returnStatus: o.returnStatus !== 'None' ? o.returnStatus : 'N/A'
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
