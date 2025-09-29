import mongoose from 'mongoose';

const SystemInstructionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

const SystemInstruction = mongoose.model('SystemInstruction', SystemInstructionSchema);
export default SystemInstruction;