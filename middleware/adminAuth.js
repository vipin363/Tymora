

export const isAdminLogin = (req, res, next) => {
  if (req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  next();
};

export const isAdminAuth = (req, res, next) => {
  if (req.session.admin) {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

