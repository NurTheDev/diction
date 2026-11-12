import assert from 'node:assert/strict';
import {intakeEnabled} from '../src/lib/service-status';
import {admissionSchema,bookingSchema,contactSchema} from '../src/schemas/intake';
const a={studentName:'Amina Akter',dob:'2012-04-15',gender:'female',guardianName:'Rahima Akter',phone:'01712345678',whatsapp:'',email:'',relation:'Mother',grade:'8',school:'Example School',medium:'bangla',previousResult:'',courseType:'individual',subjects:['math'],packageName:'',batchPreference:'',consent:true};
assert.equal(admissionSchema.safeParse(a).success,true);
assert.equal(admissionSchema.safeParse({...a,dob:'2023-02-30'}).success,false);
assert.equal(admissionSchema.safeParse({...a,subjects:[]}).success,false);
assert.equal(admissionSchema.safeParse({...a,courseType:'package',subjects:[],packageName:''}).success,false);
assert.equal(admissionSchema.safeParse({...a,phone:'123'}).success,false);
assert.equal(admissionSchema.safeParse({...a,consent:false}).success,false);
assert.equal(bookingSchema.safeParse({grade:'8',subject:'math',slotId:'507f1f77bcf86cd799439011',slotStartAt:'2099-01-01T04:00:00.000Z',slotEndAt:'2099-01-01T05:00:00.000Z',studentName:'Amina Akter',phone:'+8801712345678',email:'',consent:true}).success,true);
assert.equal(bookingSchema.safeParse({grade:'3',subject:'math',slotId:'bad',studentName:'A',phone:'123',email:'',consent:true}).success,false);
assert.equal(contactSchema.safeParse({name:'Amina',phone:'',email:'',message:'Please provide course details.',consent:true}).success,false);
assert.equal(contactSchema.safeParse({name:'Amina',phone:'',email:'test@example.com',message:'Please provide course details.',consent:true}).success,true);
const saved={...process.env};try{Object.assign(process.env,{NODE_ENV:'development',MONGODB_URI:'mongodb://test',NEXTAUTH_SECRET:'not-a-real-secret',NEXTAUTH_URL:'http://test',DATA_COLLECTION_ENABLED:'true',PREVIEW_WITHOUT_SERVICES:'0'});assert.equal(intakeEnabled(),true);process.env.PREVIEW_WITHOUT_SERVICES='1';assert.equal(intakeEnabled(),false);process.env.PREVIEW_WITHOUT_SERVICES='0';process.env.DATA_COLLECTION_ENABLED='false';assert.equal(intakeEnabled(),false);}finally{for(const key of ['NODE_ENV','MONGODB_URI','NEXTAUTH_SECRET','NEXTAUTH_URL','DATA_COLLECTION_ENABLED','PREVIEW_WITHOUT_SERVICES']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
console.log('Intake schema and availability tests passed.');
