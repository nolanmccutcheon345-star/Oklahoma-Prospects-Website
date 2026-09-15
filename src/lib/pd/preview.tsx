import { createContext, useContext, type ReactNode } from 'react';
import { filterDevelopmentData, scopeForViewer, type PdViewer } from './access';
import type { DevelopmentData } from './types';
export function previewData(data:DevelopmentData,viewer:PdViewer){return filterDevelopmentData(data,scopeForViewer(viewer,data));}
const PreviewContext=createContext(false);
export function ReadOnlyPreview({active,children}:{active:boolean;children:ReactNode}){return <PreviewContext.Provider value={active}>{children}</PreviewContext.Provider>;}
export const useReadOnlyPreview=()=>useContext(PreviewContext);
