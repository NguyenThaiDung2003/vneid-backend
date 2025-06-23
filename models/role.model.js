const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ['user', 'admin'], // bạn có thể giới hạn trước danh sách
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', RoleSchema, 'roles'); // collection 'roles'