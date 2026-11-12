import {Schema,model,models} from 'mongoose';
const schema=new Schema({actor:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},action:{type:String,required:true},target:{type:String,required:true}},{timestamps:true});
schema.index({createdAt:-1});
export const AdminAudit=models.AdminAudit||model('AdminAudit',schema);
