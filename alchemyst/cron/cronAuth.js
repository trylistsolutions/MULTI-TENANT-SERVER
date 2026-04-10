module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token !== process.env.ALCHEMYST_CRON_SECRET_KEY) {
    return res.status(403).json({ success: false, message: 'Unauthorized cron request' });
  }
  next();
};
