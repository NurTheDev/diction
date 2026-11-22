import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import {CredentialsSignin} from 'next-auth';
/** Too many tries from this address or for this name: the login page says "wait", not "wrong password". */
class LoginRateLimited extends CredentialsSignin{code='rate_limited'}
import bcrypt from 'bcryptjs';
import {authConfig} from './auth.config';
import {connectDB} from './db';
import {User} from '@/models/User';
import {loginSchema} from '@/schemas/auth';
import {checkRateLimit} from './rate-limit';
import {randomBytes} from 'node:crypto';
const dummyHash=bcrypt.hash(randomBytes(32).toString('hex'),12);
const providers=[Credentials({credentials:{identifier:{},password:{}},async authorize(credentials){const parsed=loginSchema.safeParse(credentials);if(!parsed.success)return null; await connectDB();const identifier=parsed.data.identifier.toLowerCase();if(!await checkRateLimit('login-ip',20)||!await checkRateLimit(`login:${identifier}`,8))throw new LoginRateLimited();const user=await User.findOne({$or:[{email:identifier},{phone:identifier}],active:true}).select('+passwordHash').lean();const matches=await bcrypt.compare(parsed.data.password,user?.passwordHash||await dummyHash);if(!user || !matches) return null;return {id:String(user._id),name:user.name,email:user.email,role:user.role,sessionVersion:user.sessionVersion??0};}})];
export const {handlers,auth,signIn,signOut}=NextAuth({...authConfig,secret:process.env.NEXTAUTH_SECRET,providers});
