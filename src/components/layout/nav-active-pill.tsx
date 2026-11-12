'use client';
import {motion,useReducedMotion} from 'motion/react';
export default function ActivePill(){const reduced=useReducedMotion();return <motion.span className="nav-active-pill" layoutId="public-active-nav" transition={reduced?{duration:0}:{type:'spring',stiffness:430,damping:35}}/>}
