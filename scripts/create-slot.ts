/** Temporary operator tool until the authenticated slot manager is implemented. */
import {z} from 'zod';
import mongoose from 'mongoose';
import {connectDB} from '../src/lib/db';
import {Slot} from '../src/models/Intake';
import {subjectValues} from '../src/schemas/intake';
async function main(){const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(2,i),arg.slice(i+1)];}));const schema=z.object({grade:z.enum(['4','5','6','7','8','9','10','11','12']),subject:z.enum(subjectValues),start:z.string().datetime({offset:true}),end:z.string().datetime({offset:true}),capacity:z.coerce.number().int().min(1).max(1000)});const data=schema.parse(args);const startAt=new Date(data.start),endAt=new Date(data.end);if(startAt<=new Date()||endAt<=startAt)throw new Error('Start must be in the future, and end must be after start.');await connectDB();await Slot.init();const slot=await Slot.create({grade:data.grade,subject:data.subject,startAt,endAt,capacity:data.capacity});console.log(`Created slot ${slot.id}.`);await mongoose.disconnect();}
main().catch(e=>{console.error('Could not create slot:',e instanceof Error?e.message:'unknown error');process.exit(1)});
