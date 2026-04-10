const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const replySchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'replies.author.role'
    },
    name: {
      type: String,
      required: true
    },
    role: {
      type: String,
      required: true,
      enum: ['admin', 'tutor']
    }
  }
}, {
  timestamps: true
});

const forumSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['discussion', 'announcement'],
    default: 'discussion'
  },
  priority: {
    type: String,
    required: true,
    enum: ['normal', 'high', 'urgent'],
    default: 'normal'
  },
  expiryDate: {
    type: Date,
    default: null
  },
    status: {
    type: String,
    enum: ['open', 'resolved', 'closed'],
    default: 'open'
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'resolvedBy.role'
    },
    name: String,
    role: {
      type: String,
      enum: ['admin', 'tutor']
    }
  },
  tags: [{
    type: String,
    trim: true
  }],
  createdBy: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'createdBy.role'
    },
    name: {
      type: String,
      required: true
    },
    role: {
      type: String,
      required: true,
      enum: ['admin', 'tutor']
    }
  },
  replies: [replySchema],
  views: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    userName: {
      type: String,
      required: true
    },
    userRole: {
      type: String,
      required: true,
      enum: ['admin', 'tutor']
    },
    profileImage: {
      type: String,
      default: null
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
forumSchema.index({ createdAt: -1 });
forumSchema.index({ type: 1, isActive: 1 });
forumSchema.index({ expiryDate: 1 });
forumSchema.index({ 'createdBy.id': 1 });

// Virtual to check if forum is expired
forumSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

// Method to check if user can reply (not expired and active)
forumSchema.methods.canReply = function() {
  return this.isActive && !this.isExpired;
};

module.exports = arobiscaSmsModel('Forum', forumSchema);