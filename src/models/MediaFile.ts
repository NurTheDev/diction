import { Schema, model, models, type Model } from "mongoose";
import {addRecycleFields} from './recycle';
export interface IMediaFile {
  publicId: string;
  url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  storage?: "cloudinary" | "mongo";
  data?: Buffer;
  createdAt: Date;
  updatedAt: Date;
}
const schema = new Schema<IMediaFile>(
  {
    publicId: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    format: { type: String, required: true },
    bytes: { type: Number, required: true },
    storage: {
      type: String,
      enum: ["cloudinary", "mongo"],
      default: "cloudinary",
    },
    data: { type: Buffer, select: false },
  },
  { timestamps: true },
);addRecycleFields(schema);
schema.index({ createdAt: -1 });
export const MediaFile =
  (models.MediaFile as Model<IMediaFile>) ||
  model<IMediaFile>("MediaFile", schema);
