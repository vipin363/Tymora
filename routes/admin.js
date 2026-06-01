import express from 'express';
const router=express.Router()
import {isAdminLogin,isAdminAuth} from '../middleware/adminAuth.js'
import {loadLogin,login,loadDashboard,logout,loadForgotPassword,forgotPassword,
       resetAdminPassword,loadUsers,blockUser,unblockUser,deleteUser,loadUserProfile,
       loadCategoryManagement,addCategory,editCategory,deleteCategory,permanentDeleteCategory, 
       restoreCategory, loadTrash,getCategoryStats,loadProductManagement, addProduct, editProduct,
       getProductJson, softDeleteProduct, loadProductTrash,restoreProduct, permanentDeleteProduct, 
       getProductDetail, getVariants, addVariant, editVariant, getVariantJson,softDeleteVariant, 
       getVariantTrash, restoreVariant, permanentDeleteVariant,getMaterials, addMaterial, 
       getSavedColors, saveColor, generateProductSku, generateVariantSku,setDefaultVariant,
       loadAdminOrders, loadAdminOrderDetail, updateOrderStatus, updateItemStatus, loadSettings, updateSettings,
       loadAdminReturns, approveReturn, rejectReturn, updatePickupStatus, inspectReturn, updateRefundStatus, updateItemReturnAction } from '../controller/adminController.js';
import { loadAdminReviews, toggleReviewStatus, deleteReview } from '../controller/adminReviewController.js';
import { loadAdminOffers, createOffer, updateOffer, toggleOfferStatus, deleteOffer } from '../controller/offerController.js';
import { loadAdminCoupons, createCoupon, updateCoupon, toggleCouponStatus, deleteCoupon } from '../controller/couponController.js';
import { loadSalesReport, exportPdfReport, exportExcelReport, getDashboardData } from '../controller/adminReportController.js';
import { loadAdminOtpPage, verifyAdminForgotOtp,resendAdminOtp } from '../controller/otpController.js';
import { loadLedgerBook, exportLedgerExcel, exportLedgerPdf } from '../controller/adminLedgerController.js';
import upload from '../middleware/uploard.js';
import Category from '../model/categoryModel.js';
import uploadProduct from '../middleware/productUpload.js'

router.get('/login',isAdminLogin,loadLogin)
router.post("/login", login);
router.get("/dashboard", isAdminAuth, loadDashboard);
router.get("/dashboard/data", isAdminAuth, getDashboardData);

router.get('/forgotPassword',isAdminLogin,loadForgotPassword)
router.post('/forgotPassword',forgotPassword)

router.get('/otp', (req,res,next)=>{
  if(!req.session.resetEmail){
    return res.redirect('/admin/login');
    }
     next(); },
      loadAdminOtpPage);
router.post('/otp', verifyAdminForgotOtp);
router.post('/resend-otp', resendAdminOtp);
router.get('/resetPassword', (req,res)=>{
  if(!req.session.resetVerified){
    return res.redirect('/admin/forgotPassword');
  }
  res.render('admin/resetPassword');
});
router.post('/resetPassword', resetAdminPassword);

router.get('/users', isAdminAuth, loadUsers);

router.post('/block-user/:id', isAdminAuth, blockUser);
router.post('/unblock-user/:id', isAdminAuth, unblockUser);
router.post('/delete-user/:id', isAdminAuth, deleteUser);
router.get('/users/:id',isAdminAuth, loadUserProfile);

router.get('/categoryManagement', isAdminAuth, loadCategoryManagement);
router.post('/categoryManagement/add', isAdminAuth, upload.single('image'), addCategory);
router.post('/categoryManagement/edit/:id', isAdminAuth, upload.single('image'), editCategory);
router.post('/categoryManagement/toggle/:id', isAdminAuth, async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    cat.is_visible = !cat.is_visible;
    await cat.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});
router.post('/categoryManagement/delete/:id', isAdminAuth, deleteCategory);
router.get('/categoryManagement/trash', isAdminAuth, loadTrash);
router.post('/categoryManagement/restore/:id', isAdminAuth, restoreCategory);
router.post('/categoryManagement/permanent-delete/:id', isAdminAuth, permanentDeleteCategory);
router.get('/categoryManagement/stats', isAdminAuth, getCategoryStats);

router.get('/products', isAdminAuth, loadProductManagement);

router.get('/products/trash', isAdminAuth, loadProductTrash);
router.post('/products/add', isAdminAuth, uploadProduct.array('images', 10), addProduct);

router.get('/products/variants/:variantId/json', isAdminAuth, getVariantJson);
router.post('/products/variants/:variantId/edit', isAdminAuth, uploadProduct.array('images', 10), editVariant);
router.post('/products/variants/:variantId/delete', isAdminAuth, softDeleteVariant);
router.post('/products/variants/:variantId/restore', isAdminAuth, restoreVariant);
router.post('/products/variants/:variantId/permanent-delete', isAdminAuth, permanentDeleteVariant);

router.get('/products/:id/json', isAdminAuth, getProductJson);
router.get('/products/:productId/variants', isAdminAuth, getVariants);
router.get('/products/:productId/variants/trash', isAdminAuth, getVariantTrash);
router.post('/products/:productId/variants/add', isAdminAuth, uploadProduct.array('images', 10), addVariant);
router.post('/products/:productId/variants/:variantId/set-default', isAdminAuth, setDefaultVariant);
router.post('/products/edit/:id', isAdminAuth, uploadProduct.array('images', 10), editProduct);
router.post('/products/delete/:id', isAdminAuth, softDeleteProduct);
router.post('/products/restore/:id', isAdminAuth, restoreProduct);
router.post('/products/permanent-delete/:id', isAdminAuth, permanentDeleteProduct);

router.get('/products/:id', isAdminAuth, getProductDetail);



router.get('/materials', getMaterials);
router.post('/materials/add', addMaterial);

router.get('/saved-colors', getSavedColors);
router.post('/saved-colors', saveColor);

router.get('/sku/product', generateProductSku);
router.get('/sku/variant', generateVariantSku);

router.get('/logout', logout);

router.get('/orders', isAdminAuth, loadAdminOrders);
router.get('/orders/:orderId', isAdminAuth, loadAdminOrderDetail);
router.post('/orders/:orderId/status', isAdminAuth, updateOrderStatus);
router.post('/orders/:orderId/items/:itemId/status', isAdminAuth, updateItemStatus);

router.get('/settings', isAdminAuth, loadSettings);
router.post('/settings', isAdminAuth, updateSettings);


router.get('/returns', isAdminAuth, loadAdminReturns);
router.post('/returns/:orderId/approve', isAdminAuth, approveReturn);
router.post('/returns/:orderId/reject', isAdminAuth, rejectReturn);
router.post('/returns/:orderId/pickup-status', isAdminAuth, updatePickupStatus);
router.post('/returns/:orderId/inspect', isAdminAuth, inspectReturn);
router.post('/returns/:orderId/refund-status', isAdminAuth, updateRefundStatus);


router.post('/orders/:orderId/items/:itemId/return-action', isAdminAuth, updateItemReturnAction);


router.get('/reviews', isAdminAuth, loadAdminReviews);
router.patch('/reviews/:id/status', isAdminAuth, toggleReviewStatus);
router.delete('/reviews/:id', isAdminAuth, deleteReview);


router.get('/offers', isAdminAuth, loadAdminOffers);
router.post('/offers', isAdminAuth, createOffer);
router.put('/offers/:id', isAdminAuth, updateOffer);
router.patch('/offers/:id/status', isAdminAuth, toggleOfferStatus);
router.delete('/offers/:id', isAdminAuth, deleteOffer);


router.get('/coupons', isAdminAuth, loadAdminCoupons);
router.post('/coupons', isAdminAuth, createCoupon);
router.put('/coupons/:id', isAdminAuth, updateCoupon);
router.patch('/coupons/:id/status', isAdminAuth, toggleCouponStatus);
router.delete('/coupons/:id', isAdminAuth, deleteCoupon);


router.get('/reports', isAdminAuth, loadSalesReport);
router.get('/reports/export/pdf', isAdminAuth, exportPdfReport);
router.get('/reports/export/excel', isAdminAuth, exportExcelReport);


router.get('/ledger', isAdminAuth, loadLedgerBook);
router.get('/ledger/export/excel', isAdminAuth, exportLedgerExcel);
router.get('/ledger/export/pdf', isAdminAuth, exportLedgerPdf);

router.use((req,res)=>{
   res.redirect('/admin/login');
});

export default router;
