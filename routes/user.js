import express  from 'express';
const router=express.Router()
import {isLogin} from '../middleware/userAuth.js';
import {loadLogin,login} from '../controller/userController.js';

router.get('/login',isLogin,loadLogin)
router.post('/login',login)



export default router;






