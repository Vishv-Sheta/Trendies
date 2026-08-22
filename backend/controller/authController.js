const { genToken, genTokenAdmin } = require("../config/token.js");
const User = require("../model/userModel.js");
const validator = require("validator");
const bcrypt = require("bcryptjs");
require("../config/firebaseAdmin.js");
const { getAuth } = require("firebase-admin/auth");

const isProd = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: isProd,          
  sameSite: isProd ? "None" : "Lax",
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existUser = await User.findOne({ email });
    if (existUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be 6+ chars" });
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashPassword,
    });

    const token = await genToken(user._id);
    res.cookie("token", token, cookieOptions);

    return res.status(201).json(user);
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Register error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(404).json({ message: "Invalid credentials" });
    }

    const token = await genToken(user._id);
    res.cookie("token", token, cookieOptions);

    return res.status(200).json(user);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login error" });
  }
};

const logout = async (req, res) => {
  try {
    res.clearCookie("token", cookieOptions);
    return res.status(200).json({ message: "Logged out" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Logout error" });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Firebase ID token is required" });
    }

    const decodedToken = await getAuth().verifyIdToken(idToken);
    const { name, email } = decodedToken;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name, email });
    }

    const token = await genToken(user._id);
    res.cookie("token", token, cookieOptions);

    return res.status(200).json(user);
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ message: "Google login error" });
  }
};

const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = await genTokenAdmin(email);
      res.cookie("token", token, cookieOptions);

      return res.status(200).json({ message: "Admin login successful" });
    }

    return res.status(401).json({ message: "Invalid admin credentials" });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Admin login error" });
  }
};

module.exports = {
  register,
  login,
  logout,
  googleLogin,
  adminLogin,
};
