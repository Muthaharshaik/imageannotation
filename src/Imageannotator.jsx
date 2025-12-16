import { createElement, useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import CryptoJS from "crypto-js";
import "./ui/Imageannotator.css";

// Portal wrapper to render modals outside Mendix layout
const AnnotationPortal = ({ children }) => {
    return createPortal(children, document.body);
};

// Global counter for widget instances
let globalWidgetCounter = 0;

function Imageannotator(props) {
    const {
        awsAccessKey,
        awsSecretKey, 
        awsSessionToken,
        awsRegion,
        s3BucketName,
        s3FileName,
        userName,
        imageAnnotations,
        readOnly = false,
        allowDelete = true,
        onAnnotationAdd,
        onAnnotationDelete,
        allowAnnotations,
        annotationMode,
        referenceDocuments,
        name,
        tabIndex,
        style,
        ...otherProps
    } = props;

    // Handle class prop from Mendix Studio Pro
    const className = otherProps.class || otherProps.className || '';
    
    // Ultra-unique widget instance ID
    const [widgetInstanceId] = useState(() => {
        globalWidgetCounter++;
        const timestamp = Date.now();
        const randomPart = Math.random().toString(36).substr(2, 16);
        const counterPart = globalWidgetCounter.toString().padStart(6, '0');
        const processId = typeof window !== 'undefined' ? window.performance.now().toString().replace('.', '') : '0';
        const uniqueHash = Math.random().toString(36).substr(2, 8);
        return `img-widget-${counterPart}-${timestamp}-${randomPart}-${processId}-${uniqueHash}`;
    });
    
    // Multiple isolated refs for complete widget separation
    const imageRef = useRef(null);
    const richTextRef = useRef(null);
    const searchInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const containerRef = useRef(null);
    const refDocDropdownRef = useRef(null);
    const imageContainerRef = useRef(null);
    const scrollContainerRef = useRef(null);
    
    // Core state
    const [annotations, setAnnotations] = useState([]);
    const [imageUrl, setImageUrl] = useState(null);
    const [loadingImage, setLoadingImage] = useState(false);
    const [imageError, setImageError] = useState(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    
    // Image dimensions
    const [imageDimensions, setImageDimensions] = useState({ 
        width: 0, 
        height: 0, 
        aspectRatio: 1 
    });
    
    // Maximize/Minimize state
    const [isMaximized, setIsMaximized] = useState(false);
    
    // Annotation state
    const [isAnnotationMode, setIsAnnotationMode] = useState(false);
    const [annotationType, setAnnotationType] = useState('point');
    const [showForm, setShowForm] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState(null);
    const [selectedArea, setSelectedArea] = useState(null);
    const [activeAnnotationId, setActiveAnnotationId] = useState(null);
    
    // Area selection state
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState(null);
    const [currentArea, setCurrentArea] = useState(null);
    
    // Form state
    const [comment, setComment] = useState('');
    const [selectedReferenceDoc, setSelectedReferenceDoc] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingAnnotation, setEditingAnnotation] = useState(null);
    
    // File upload state
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [richTextContent, setRichTextContent] = useState('');
    
    // File preview state
    const [showFilePreview, setShowFilePreview] = useState(false);
    const [previewFile, setPreviewFile] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    
    // Reference document search state
    const [referenceSearchTerm, setReferenceSearchTerm] = useState('');
    const [showReferenceDropdown, setShowReferenceDropdown] = useState(false);
    const [selectedReferenceDocName, setSelectedReferenceDocName] = useState('');
    
    // UI state
    const [showAnnotationDropdown, setShowAnnotationDropdown] = useState(false);
    const [canAddAnnotations, setCanAddAnnotations] = useState(true);
    const [referenceDocList, setReferenceDocList] = useState([]);
    
    // Read more/less state for annotations
    const [expandedAnnotations, setExpandedAnnotations] = useState(new Set());
    
    // Get current user
    const currentUser = (userName && userName.value) ? userName.value : 
                        (typeof userName === 'string' ? userName : "Unknown User");

    const ANNOTATION_COLOR = '#3B82F6';
    const MAX_COMMENT_LENGTH = 100;

    // ENHANCED: Debug logging function
    const addDebugLog = useCallback((message) => {
        console.log(`[Widget ${widgetInstanceId}] ${message}`);
    }, [widgetInstanceId]);

    // ENHANCED: Execute Mendix microflow with proper error handling
    const executeMendixAction = useCallback((action, actionName) => {
        if (!action) {
            addDebugLog(`⚠️ ${actionName} action not configured`);
            return false;
        }

        addDebugLog(`📞 Executing ${actionName} microflow...`);
        
        try {
            // Method 1: Check if action has execute method (common pattern)
            if (action && typeof action.execute === 'function') {
                addDebugLog(`🎯 Calling ${actionName} via execute() method`);
                action.execute();
                addDebugLog(`✅ ${actionName} microflow executed successfully via execute()`);
                return true;
            }
            
            // Method 2: Direct function call
            else if (typeof action === 'function') {
                addDebugLog(`🎯 Calling ${actionName} as direct function`);
                action();
                addDebugLog(`✅ ${actionName} microflow executed successfully as function`);
                return true;
            }
            
            // Method 3: Check if action is an object with other callable methods
            else if (action && typeof action === 'object') {
                addDebugLog(`🔍 ${actionName} is object, checking for callable methods`);
                
                // Try common Mendix action patterns
                if (typeof action.call === 'function') {
                    addDebugLog(`🎯 Calling ${actionName} via call() method`);
                    action.call();
                    addDebugLog(`✅ ${actionName} microflow executed successfully via call()`);
                    return true;
                }
                
                if (typeof action.invoke === 'function') {
                    addDebugLog(`🎯 Calling ${actionName} via invoke() method`);
                    action.invoke();
                    addDebugLog(`✅ ${actionName} microflow executed successfully via invoke()`);
                    return true;
                }
                
                // Log available methods for debugging
                const availableMethods = Object.getOwnPropertyNames(action).filter(prop => typeof action[prop] === 'function');
                addDebugLog(`🔍 Available methods on ${actionName}: ${availableMethods.join(', ')}`);
            }
            
            addDebugLog(`❌ ${actionName} action exists but no valid execution method found`);
            addDebugLog(`🔍 ${actionName} type: ${typeof action}, constructor: ${action?.constructor?.name}`);
            
            return false;
            
        } catch (error) {
            addDebugLog(`❌ Error executing ${actionName} microflow: ${error.message}`);
            console.error(`[Widget ${widgetInstanceId}] ${actionName} execution error:`, error);
            return false;
        }
    }, [addDebugLog, widgetInstanceId]);

    // Widget mount/unmount logging
    useEffect(() => {
        console.log(`🚀 [Widget ${widgetInstanceId}] ImageAnnotator initialized - NATURAL SIZE WITH SCROLL + NAVIGATION`);
        addDebugLog("=== MICROFLOW CONFIGURATION CHECK ===");
        addDebugLog(`onAnnotationAdd configured: ${!!onAnnotationAdd}`);
        addDebugLog(`onAnnotationDelete configured: ${!!onAnnotationDelete}`);
        
        if (onAnnotationAdd) {
            addDebugLog(`onAnnotationAdd type: ${typeof onAnnotationAdd}`);
            addDebugLog(`onAnnotationAdd constructor: ${onAnnotationAdd?.constructor?.name}`);
            addDebugLog(`onAnnotationAdd has execute: ${typeof onAnnotationAdd?.execute === 'function'}`);
        }
        
        if (onAnnotationDelete) {
            addDebugLog(`onAnnotationDelete type: ${typeof onAnnotationDelete}`);
            addDebugLog(`onAnnotationDelete constructor: ${onAnnotationDelete?.constructor?.name}`);
            addDebugLog(`onAnnotationDelete has execute: ${typeof onAnnotationDelete?.execute === 'function'}`);
        }
        addDebugLog("=== END MICROFLOW CONFIGURATION CHECK ===");
        
        return () => {
            console.log(`🔥 [Widget ${widgetInstanceId}] ImageAnnotator unmounted`);
            // Cleanup
            uploadedFiles.forEach(file => {
                if (file.blobUrl) {
                    URL.revokeObjectURL(file.blobUrl);
                }
            });
        };
    }, [widgetInstanceId, onAnnotationAdd, onAnnotationDelete, addDebugLog]);

    // Simple image load handler
    const handleImageLoad = useCallback(() => {
        if (imageRef.current) {
            const { naturalWidth, naturalHeight } = imageRef.current;
            const aspectRatio = naturalWidth / naturalHeight;
            
            setImageDimensions({
                width: naturalWidth,
                height: naturalHeight,
                aspectRatio: aspectRatio
            });
            
            setImageLoaded(true);
            
            console.log(`🖼️ [Widget ${widgetInstanceId}] Image loaded - NATURAL SIZE WITH NAVIGATION:`, {
                width: naturalWidth,
                height: naturalHeight,
                aspectRatio: aspectRatio.toFixed(4),
                type: aspectRatio > 1.5 ? 'wide landscape' :
                      aspectRatio > 1.0 ? 'landscape' : 
                      aspectRatio < 0.7 ? 'portrait' : 'square'
            });
        }
    }, [widgetInstanceId]);

    // Handle maximize/minimize toggle
    const handleMaximizeToggle = useCallback(() => {
        const newMaximizedState = !isMaximized;
        console.log(`🔄 [Widget ${widgetInstanceId}] Toggling maximize: ${isMaximized} -> ${newMaximizedState}`);
        setIsMaximized(newMaximizedState);
    }, [isMaximized, widgetInstanceId]);

    // Handle escape key to exit maximize mode
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && isMaximized) {
                setIsMaximized(false);
                console.log(`⌨️ [Widget ${widgetInstanceId}] Escape key pressed - exiting maximize mode`);
            }
        };

        if (isMaximized) {
            document.addEventListener('keydown', handleKeyDown);
            return () => {
                document.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [isMaximized, widgetInstanceId]);

    // Enhanced custom editability effect
    useEffect(() => {
        let shouldShowButton = true;
        
        if (readOnly === true) {
            shouldShowButton = false;
        } else if (allowAnnotations !== undefined && allowAnnotations !== null) {
            if (allowAnnotations.value !== undefined) {
                shouldShowButton = allowAnnotations.value === true;
            } else {
                shouldShowButton = allowAnnotations === true;
            }
        } else if (annotationMode !== undefined && annotationMode !== null) {
            let modeValue = annotationMode.value || annotationMode;
            if (typeof modeValue === 'string') {
                const mode = modeValue.toUpperCase();
                if (mode === 'DISABLED' || mode === 'DISABLE' || mode === 'FALSE' || mode === 'READ_ONLY' || mode === 'READONLY') {
                    shouldShowButton = false;
                }
            }
        }
        
        setCanAddAnnotations(shouldShowButton);
        console.log(`🔒 [Widget ${widgetInstanceId}] Annotations access updated:`, shouldShowButton);
    }, [allowAnnotations, annotationMode, readOnly, widgetInstanceId]);

    // Enhanced AWS Signature V4 implementation
    const generateSignedUrl = useCallback(async (bucket, key, region, accessKey, secretKey, sessionToken) => {
        try {
            console.log(`🔗 [Widget ${widgetInstanceId}] Generating signed URL for:`, { bucket, key: key.substring(0, 50) + '...' });
            
            const method = 'GET';
            const service = 's3';
            const endpoint = `https://${bucket}.s3.${region}.amazonaws.com`;
            
            // Enhanced URL encoding for S3 keys
            const encodeS3Key = (key) => {
                let decodedKey;
                try {
                    decodedKey = decodeURIComponent(key);
                } catch (e) {
                    decodedKey = key;
                }
                
                const pathParts = decodedKey.split('/');
                const encodedParts = pathParts.map(part => {
                    return encodeURIComponent(part)
                        .replace(/[!'()*]/g, function(c) {
                            return '%' + c.charCodeAt(0).toString(16).toUpperCase();
                        });
                });
                
                return encodedParts.join('/');
            };
            
            const encodedKey = encodeS3Key(key);
            const canonicalUri = `/${encodedKey}`;
            
            const now = new Date();
            const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
            const dateStamp = amzDate.substr(0, 8);
            
            const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
            const algorithm = 'AWS4-HMAC-SHA256';
            
            const queryParams = new URLSearchParams();
            queryParams.set('X-Amz-Algorithm', algorithm);
            queryParams.set('X-Amz-Credential', `${accessKey}/${credentialScope}`);
            queryParams.set('X-Amz-Date', amzDate);
            queryParams.set('X-Amz-Expires', '3600');
            queryParams.set('X-Amz-SignedHeaders', 'host');
            if(sessionToken) {
                queryParams.set('X-Amz-Security-Token', sessionToken)
            }
            
            const canonicalQuerystring = queryParams.toString();
            const canonicalHeaders = `host:${bucket}.s3.${region}.amazonaws.com\n`;
            const signedHeaders = 'host';
            const payloadHash = 'UNSIGNED-PAYLOAD';
            
            const canonicalRequest = [
                method,
                canonicalUri,
                canonicalQuerystring,
                canonicalHeaders,
                signedHeaders,
                payloadHash
            ].join('\n');
            
            const stringToSign = [
                algorithm,
                amzDate,
                credentialScope,
                CryptoJS.SHA256(canonicalRequest).toString()
            ].join('\n');
            
            const kDate = CryptoJS.HmacSHA256(dateStamp, `AWS4${secretKey}`);
            const kRegion = CryptoJS.HmacSHA256(region, kDate);
            const kService = CryptoJS.HmacSHA256(service, kRegion);
            const kSigning = CryptoJS.HmacSHA256('aws4_request', kService);
            const signature = CryptoJS.HmacSHA256(stringToSign, kSigning).toString();
            
            queryParams.set('X-Amz-Signature', signature);
            
            const finalUrl = `${endpoint}${canonicalUri}?${queryParams.toString()}`;
            
            console.log(`✅ [Widget ${widgetInstanceId}] Signed URL generated successfully`);
            return finalUrl;
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error generating signed URL:`, error);
            throw new Error(`Failed to generate signed URL: ${error.message}`);
        }
    }, [widgetInstanceId]);

    // Generate image URL with enhanced error handling
    const generateImageUrl = useCallback(async () => {
        if (!s3BucketName?.value || !s3FileName?.value || !awsAccessKey?.value || 
            !awsSecretKey?.value || !awsRegion?.value || !awsSessionToken?.value) {
            const missingParams = [];
            if (!s3BucketName?.value) missingParams.push('bucket');
            if (!s3FileName?.value) missingParams.push('fileName');
            if (!awsAccessKey?.value) missingParams.push('accessKey');
            if (!awsSecretKey?.value) missingParams.push('secretKey');
            if (!awsRegion?.value) missingParams.push('region');
            if (!awsSessionToken?.value) missingParams.push('Session Token');
            
            const errorMsg = `Missing required AWS configuration: ${missingParams.join(', ')}`;
            console.error(`❌ [Widget ${widgetInstanceId}] ${errorMsg}`);
            setImageError(errorMsg);
            setLoadingImage(false);
            return;
        }

        console.log(`📂 [Widget ${widgetInstanceId}] Loading image for file:`, s3FileName.value);
        setLoadingImage(true);
        setImageError(null);
        setImageLoaded(false);
        setImageUrl(null);
        setImageDimensions({ width: 0, height: 0, aspectRatio: 1 });

        try {
            const signedUrl = await generateSignedUrl(
                s3BucketName.value,
                s3FileName.value,
                awsRegion.value,
                awsAccessKey.value,
                awsSecretKey.value,
                awsSessionToken.value
            );
            
            // Test the URL before setting it
            const testImage = new Image();
            testImage.onload = () => {
                console.log(`[Widget ${widgetInstanceId}] Image loaded successfully`);
                setImageUrl(signedUrl);
                setLoadingImage(false);
            };
            testImage.onerror = (error) => {
                console.error(`[Widget ${widgetInstanceId}] Image failed to load:`, error);
                setImageError(`Failed to load image: Please check the file path and AWS configuration`);
                setLoadingImage(false);
            };
            
            // Set a timeout for the image load test
            setTimeout(() => {
                if (!testImage.complete) {
                    console.warn(`⚠️ [Widget ${widgetInstanceId}] Image load timeout - displaying anyway`);
                    setImageUrl(signedUrl);
                    setLoadingImage(false);
                }
            }, 10000);
            
            testImage.src = signedUrl;
            
        } catch (error) {
            console.error(`[Widget ${widgetInstanceId}] Error generating image URL:`, error);
            setImageError(`Failed to generate image URL: ${error.message}`);
            setLoadingImage(false);
        }
    }, [s3BucketName, s3FileName, awsAccessKey, awsSecretKey, awsSessionToken, awsRegion, generateSignedUrl, widgetInstanceId]);

    // Load image URL when AWS credentials change
    useEffect(() => {
        if (awsAccessKey?.value && awsSecretKey?.value && awsRegion?.value && 
            s3BucketName?.value && s3FileName?.value && awsSessionToken?.value) {
            generateImageUrl();
        }
    }, [awsAccessKey, awsSecretKey, awsRegion, s3BucketName, s3FileName, generateImageUrl, awsSessionToken]);

    // Parse reference documents
    useEffect(() => {
        try {
            let docData = null;
            if (referenceDocuments && referenceDocuments.value !== undefined) {
                docData = referenceDocuments.value;
            } else if (typeof referenceDocuments === 'string') {
                docData = referenceDocuments;
            }
            
            if (docData && typeof docData === 'string' && docData.trim() !== '' && docData !== '[]') {
                try {
                    const parsed = JSON.parse(docData);
                    const mappedDocs = Array.isArray(parsed) ? parsed.map(doc => ({
                        id: String(doc.FileID || doc.id),
                        name: doc.Name || doc.name,
                        link: doc.Link || doc.link
                    })) : [];
                    setReferenceDocList(mappedDocs);
                    console.log(`📄 [Widget ${widgetInstanceId}] Reference documents loaded:`, mappedDocs.length);
                } catch (parseError) {
                    console.warn(`⚠️ [Widget ${widgetInstanceId}] Failed to parse reference documents JSON:`, parseError);
                    setReferenceDocList([]);
                }
            } else {
                setReferenceDocList([]);
            }
        } catch (error) {
            console.error(` [Widget ${widgetInstanceId}] Error loading reference documents:`, error);
            setReferenceDocList([]);
        }
    }, [referenceDocuments, widgetInstanceId]);

    // Load annotations from Mendix
    useEffect(() => {
        try {
            let annotationsData = null;
            let loadedAnnotations = [];
            
            if (imageAnnotations && imageAnnotations.value !== undefined) {
                annotationsData = imageAnnotations.value;
            } else if (typeof imageAnnotations === 'string') {
                annotationsData = imageAnnotations;
            }
            
            if (annotationsData && typeof annotationsData === 'string' && annotationsData.trim() !== '' && annotationsData !== '[]') {
                try {
                    const parsed = JSON.parse(annotationsData);
                    loadedAnnotations = Array.isArray(parsed) ? parsed : [];
                    console.log(`📋 [Widget ${widgetInstanceId}] Annotations loaded:`, loadedAnnotations.length);
                } catch (parseError) {
                    console.warn(`⚠️ [Widget ${widgetInstanceId}] Failed to parse annotations JSON:`, parseError);
                    loadedAnnotations = [];
                }
            }
            
            setAnnotations(loadedAnnotations);
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error loading annotations:`, error);
            setAnnotations([]);
        }
    }, [imageAnnotations, widgetInstanceId]);

    // ENHANCED: Save annotations to Mendix with proper microflow execution
    const saveAnnotationsToMendix = useCallback((annotationsArray) => {
        addDebugLog("=== SAVING IMAGE ANNOTATIONS TO MENDIX ===");
        addDebugLog(`Annotations to save: ${annotationsArray.length} items`);
        
        try {
            const jsonString = JSON.stringify(annotationsArray);
            addDebugLog(`JSON string to save: ${jsonString.substring(0, 100)}...`);
            
            let saveSuccess = false;
            
            // Save to attribute
            if (imageAnnotations && typeof imageAnnotations.setValue === 'function') {
                addDebugLog("📝 Attempting direct attribute update...");
                try {
                    imageAnnotations.setValue(jsonString);
                    saveSuccess = true;
                    addDebugLog("✅ Direct attribute update successful");
                } catch (error) {
                    addDebugLog(`❌ Direct attribute update failed: ${error.message}`);
                }
            } else if (imageAnnotations && imageAnnotations.value !== undefined) {
                addDebugLog("📝 Attempting direct value assignment...");
                try {
                    imageAnnotations.value = jsonString;
                    saveSuccess = true;
                    addDebugLog("✅ Direct value assignment successful");
                } catch (error) {
                    addDebugLog(`❌ Direct value assignment failed: ${error.message}`);
                }
            } else {
                addDebugLog("❌ imageAnnotations not available for direct update");
            }
            
            // ENHANCED: Execute onAnnotationAdd microflow
            if (onAnnotationAdd) {
                addDebugLog("📞 Executing onAnnotationAdd microflow...");
                const microflowSuccess = executeMendixAction(onAnnotationAdd, 'onAnnotationAdd');
                if (microflowSuccess) {
                    addDebugLog("✅ onAnnotationAdd microflow executed successfully");
                } else {
                    addDebugLog("❌ onAnnotationAdd microflow execution failed");
                }
            } else {
                addDebugLog("ℹ️ onAnnotationAdd not configured");
            }
            
            if (saveSuccess) {
                addDebugLog("🎉 Image annotations saved successfully to Mendix");
            } else {
                addDebugLog("⚠️ Could not save annotations - no valid save method found");
            }
            
        } catch (error) {
            addDebugLog(`❌ Error saving annotations: ${error.message}`);
            console.error(`[Widget ${widgetInstanceId}] Error saving annotations:`, error);
        }
        
        addDebugLog("=== END SAVING IMAGE ANNOTATIONS ===");
    }, [onAnnotationAdd, imageAnnotations, addDebugLog, executeMendixAction, widgetInstanceId]);

    const saveAnnotations = useCallback((newAnnotations) => {
        setAnnotations(newAnnotations);
        saveAnnotationsToMendix(newAnnotations);
    }, [saveAnnotationsToMendix]);

    // Check if current user can edit/delete an annotation
    const canEditAnnotation = useCallback((annotation) => {
        return annotation.user === currentUser;
    }, [currentUser]);

    // FIXED: Get relative coordinates for natural-sized image in scroll container
    const getRelativeCoordinates = useCallback((event) => {
        if (!imageRef.current || !imageLoaded) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Image ref not available or not loaded`);
            return null;
        }

        const img = imageRef.current;
        const imgRect = img.getBoundingClientRect();
        
        // Get the natural dimensions
        const { naturalWidth, naturalHeight } = img;
        
        if (!naturalWidth || !naturalHeight) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Image natural dimensions not available`);
            return null;
        }
        
        // SIMPLE: Since image is displayed at natural size (100% zoom), 
        // coordinate calculation is direct pixel-to-percentage conversion
        const clickX = event.clientX - imgRect.left;
        const clickY = event.clientY - imgRect.top;
        
        // Check bounds - click must be within image
        if (clickX < 0 || clickX >= imgRect.width || clickY < 0 || clickY >= imgRect.height) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Click outside image bounds`);
            return null;
        }
        
        // Convert to percentage coordinates relative to natural image size
        const xPercent = (clickX / imgRect.width) * 100;
        const yPercent = (clickY / imgRect.height) * 100;
        
        // Clamp to valid range
        const clampedX = Math.max(0, Math.min(100, xPercent));
        const clampedY = Math.max(0, Math.min(100, yPercent));
        
        console.log(`🎯 [Widget ${widgetInstanceId}] Natural size coordinates calculated:`, {
            x: clampedX.toFixed(2),
            y: clampedY.toFixed(2),
            imageSize: { width: imgRect.width, height: imgRect.height },
            naturalSize: { width: naturalWidth, height: naturalHeight }
        });
        
        return { 
            x: Number(clampedX.toFixed(2)), 
            y: Number(clampedY.toFixed(2)) 
        };
    }, [widgetInstanceId, imageLoaded]);

    // NEW: Function to scroll to annotation position when clicked in sidebar
    const scrollToAnnotation = useCallback((annotation) => {
        if (!scrollContainerRef.current || !imageRef.current || !imageLoaded) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Cannot scroll - refs not available`);
            return;
        }

        const scrollContainer = scrollContainerRef.current;
        const img = imageRef.current;
        
        // Get image dimensions
        const { naturalWidth, naturalHeight } = img;
        
        if (!naturalWidth || !naturalHeight) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Image dimensions not available for scrolling`);
            return;
        }

        let targetXPercent, targetYPercent;
        
        if (annotation.type === 'area') {
            // For area annotations, scroll to center of the area
            targetXPercent = annotation.area.x + annotation.area.width / 2;
            targetYPercent = annotation.area.y + annotation.area.height / 2;
        } else {
            // For point annotations, scroll to the point
            targetXPercent = annotation.position.x;
            targetYPercent = annotation.position.y;
        }
        
        // Calculate absolute pixel position within the image
        const targetXPixels = (targetXPercent / 100) * naturalWidth;
        const targetYPixels = (targetYPercent / 100) * naturalHeight;
        
        // Account for the 20px margin around the image (from CSS .image-container-inner margin: 20px)
        const imageMargin = 20;
        const adjustedTargetX = targetXPixels + imageMargin;
        const adjustedTargetY = targetYPixels + imageMargin;
        
        // Get container dimensions
        const containerWidth = scrollContainer.clientWidth;
        const containerHeight = scrollContainer.clientHeight;
        
        // Calculate scroll position to center the annotation in the view
        const scrollLeft = adjustedTargetX - (containerWidth / 2);
        const scrollTop = adjustedTargetY - (containerHeight / 2);
        
        // Get the scrollable area bounds (including margins)
        const totalWidth = naturalWidth + (imageMargin * 2);
        const totalHeight = naturalHeight + (imageMargin * 2);
        
        // Ensure scroll position is within bounds
        const maxScrollLeft = Math.max(0, totalWidth - containerWidth);
        const maxScrollTop = Math.max(0, totalHeight - containerHeight);
        
        const finalScrollLeft = Math.max(0, Math.min(scrollLeft, maxScrollLeft));
        const finalScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
        
        // Smooth scroll to position
        scrollContainer.scrollTo({
            left: finalScrollLeft,
            top: finalScrollTop,
            behavior: 'smooth'
        });
        
        console.log(`🎯 [Widget ${widgetInstanceId}] Scrolled to annotation ${annotation.id}:`, {
            annotationType: annotation.type,
            targetPercent: { x: targetXPercent.toFixed(2), y: targetYPercent.toFixed(2) },
            targetPixels: { x: targetXPixels.toFixed(2), y: targetYPixels.toFixed(2) },
            adjustedTarget: { x: adjustedTargetX.toFixed(2), y: adjustedTargetY.toFixed(2) },
            scrollTo: { left: finalScrollLeft.toFixed(2), top: finalScrollTop.toFixed(2) },
            imageDimensions: { width: naturalWidth, height: naturalHeight },
            containerDimensions: { width: containerWidth, height: containerHeight }
        });
    }, [widgetInstanceId, imageLoaded]);

    // Image click handler
    const handleImageClick = useCallback((event) => {
        if (!isAnnotationMode || !canAddAnnotations || annotationType !== 'point') return;

        event.preventDefault();
        event.stopPropagation();
        
        const coords = getRelativeCoordinates(event);
        if (!coords) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Invalid coordinates for point annotation`);
            return;
        }
        
        console.log(`🎯 [Widget ${widgetInstanceId}] Point annotation placed at natural size coordinates:`, coords);
        
        setSelectedPosition(coords);
        setShowForm(true);
        setIsAnnotationMode(false);
    }, [isAnnotationMode, annotationType, canAddAnnotations, getRelativeCoordinates, widgetInstanceId]);

    // Area selection
    const handleMouseDown = useCallback((event) => {
        if (!isAnnotationMode || annotationType !== 'area' || !canAddAnnotations) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        const coords = getRelativeCoordinates(event);
        if (!coords) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Invalid coordinates for area selection start`);
            return;
        }
        
        setStartPoint(coords);
        setIsDrawing(true);
        setCurrentArea({
            x: coords.x,
            y: coords.y,
            width: 0,
            height: 0
        });
        
        console.log(`🎯 [Widget ${widgetInstanceId}] Area selection started at natural size coordinates:`, coords);
    }, [isAnnotationMode, annotationType, canAddAnnotations, getRelativeCoordinates, widgetInstanceId]);

    const handleMouseMove = useCallback((event) => {
        if (!isDrawing || !startPoint) return;
        
        event.preventDefault();
        
        const coords = getRelativeCoordinates(event);
        if (!coords) return;
        
        const width = coords.x - startPoint.x;
        const height = coords.y - startPoint.y;
        
        setCurrentArea({
            x: width < 0 ? coords.x : startPoint.x,
            y: height < 0 ? coords.y : startPoint.y,
            width: Math.abs(width),
            height: Math.abs(height)
        });
    }, [isDrawing, startPoint, getRelativeCoordinates]);

    const handleMouseUp = useCallback((event) => {
        if (!isDrawing || !currentArea) return;
        
        event.preventDefault();
        setIsDrawing(false);
        
        const minAreaSize = 1.0; // Minimum 1% of image dimension
        if (currentArea.width > minAreaSize && currentArea.height > minAreaSize) {
            console.log(`✅ [Widget ${widgetInstanceId}] Area selected with natural size coordinates:`, currentArea);
            setSelectedArea(currentArea);
            setShowForm(true);
            setIsAnnotationMode(false);
        } else {
            console.log(`⚠️ [Widget ${widgetInstanceId}] Area too small, ignoring selection`);
        }
        
        setStartPoint(null);
        setCurrentArea(null);
    }, [isDrawing, currentArea, widgetInstanceId]);

    // Handle dropdown selections
    const handleSelectPoint = useCallback(() => {
        if (!canAddAnnotations) return;
        console.log(`🎯 [Widget ${widgetInstanceId}] Point annotation mode activated`);
        setAnnotationType('point');
        setIsAnnotationMode(true);
        setShowAnnotationDropdown(false);
    }, [canAddAnnotations, widgetInstanceId]);

    const handleSelectArea = useCallback(() => {
        if (!canAddAnnotations) return;
        console.log(`🎯 [Widget ${widgetInstanceId}] Area annotation mode activated`);
        setAnnotationType('area');
        setIsAnnotationMode(true);
        setShowAnnotationDropdown(false);
    }, [canAddAnnotations, widgetInstanceId]);

    // Annotation positioning style
    const getAnnotationPositionStyle = useCallback((annotation) => {
        if (annotation.type === 'area') {
            return {
                position: 'absolute',
                left: `${annotation.area.x}%`,
                top: `${annotation.area.y}%`,
                width: `${annotation.area.width}%`,
                height: `${annotation.area.height}%`,
            };
        } else {
            // Point annotation
            return {
                position: 'absolute',
                left: `${annotation.position.x}%`,
                top: `${annotation.position.y}%`,
                transform: 'translate(-50%, -50%)'
            };
        }
    }, []);

    // Reference document search functions
    const handleReferenceSearchChange = useCallback((event) => {
        const value = event.target.value;
        setReferenceSearchTerm(value);
        setShowReferenceDropdown(true);
    }, []);

    const handleReferenceSearchFocus = useCallback(() => {
        setShowReferenceDropdown(true);
    }, []);

    const handleReferenceDocSelect = useCallback((doc) => {
        console.log(`📄 [Widget ${widgetInstanceId}] Reference document selected:`, doc.name);
        setSelectedReferenceDoc(String(doc.id));
        setSelectedReferenceDocName(doc.name);
        setReferenceSearchTerm(doc.name);
        setShowReferenceDropdown(false);
    }, [widgetInstanceId]);

    const clearReferenceSelection = useCallback(() => {
        console.log(`📄 [Widget ${widgetInstanceId}] Reference document selection cleared`);
        setSelectedReferenceDoc('');
        setSelectedReferenceDocName('');
        setReferenceSearchTerm('');
        setShowReferenceDropdown(false);
    }, [widgetInstanceId]);

    // Rich text functions
    const applyRichTextFormat = useCallback((command, value = null) => {
        document.execCommand(command, false, value);
        if (richTextRef.current) {
            richTextRef.current.focus();
            setRichTextContent(richTextRef.current.innerHTML);
        }
    }, []);

    const handleRichTextInput = useCallback(() => {
        if (richTextRef.current) {
            setRichTextContent(richTextRef.current.innerHTML);
        }
    }, []);

    // File upload handler
    const uploadFileLocally = useCallback(async (file) => {
        try {
            console.log(`📎 [Widget ${widgetInstanceId}] Processing file:`, file.name);
            
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const base64Data = reader.result.split(',')[1];
                        const uniqueFileId = `${widgetInstanceId}-${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
                        
                        const processedFile = {
                            id: uniqueFileId,
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            data: base64Data,
                            storageType: 'local',
                            uploadedAt: new Date().toISOString(),
                            widgetInstanceId: widgetInstanceId
                        };
                        
                        console.log(`✅ [Widget ${widgetInstanceId}] File processed successfully:`, file.name);
                        resolve(processedFile);
                    } catch (error) {
                        console.error(`❌ [Widget ${widgetInstanceId}] Error processing file data:`, error);
                        reject(error);
                    }
                };
                reader.onerror = () => {
                    console.error(`❌ [Widget ${widgetInstanceId}] FileReader error:`, reader.error);
                    reject(reader.error);
                };
                reader.readAsDataURL(file);
            });
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Failed to process file:`, file.name, error);
            throw new Error(`Failed to process file: ${file.name}`);
        }
    }, [widgetInstanceId]);

    const handleFileUpload = useCallback(async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const files = Array.from(event.target.files);
        console.log(`📎 [Widget ${widgetInstanceId}] File upload initiated:`, files.length, 'files');
        
        if (files.length === 0) return;
        
        setIsUploading(true);
        
        try {
            const uploadedFileData = [];
            
            for (const file of files) {
                try {
                    const processedFile = await uploadFileLocally(file);
                    uploadedFileData.push(processedFile);
                } catch (fileError) {
                    console.error(`❌ [Widget ${widgetInstanceId}] Failed to process ${file.name}:`, fileError);
                }
            }
            
            if (uploadedFileData.length > 0) {
                setUploadedFiles(prev => [...prev, ...uploadedFileData]);
                console.log(`✅ [Widget ${widgetInstanceId}] Successfully uploaded ${uploadedFileData.length} files`);
            }
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error processing files:`, error);
        } finally {
            setIsUploading(false);
            if (event.target) {
                event.target.value = '';
            }
        }
    }, [uploadFileLocally, widgetInstanceId]);

    // File input trigger
    const triggerFileInput = useCallback(() => {
        console.log(`📎 [Widget ${widgetInstanceId}] Triggering file input`);
        
        if (fileInputRef.current) {
            fileInputRef.current.click();
            return;
        }
        
        console.error(`❌ [Widget ${widgetInstanceId}] File input ref not available!`);
    }, [widgetInstanceId]);

    const removeFile = useCallback((fileId) => {
        console.log(`🗑️ [Widget ${widgetInstanceId}] Removing file:`, fileId);
        setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
    }, [widgetInstanceId]);

    // Preview file
    const handlePreviewFile = useCallback(async (file) => {
        console.log(`👁️ [Widget ${widgetInstanceId}] Previewing file:`, file.name);
        setLoadingPreview(true);
        setPreviewFile(file);
        setShowFilePreview(true);
        
        try {
            if (file.data) {
                const binaryString = atob(file.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                const blob = new Blob([bytes], { type: file.type });
                const blobUrl = URL.createObjectURL(blob);
                
                setPreviewFile(prev => ({
                    ...prev,
                    blobUrl: blobUrl
                }));
            }
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error loading file for preview:`, error);
        } finally {
            setLoadingPreview(false);
        }
    }, [widgetInstanceId]);

    // Handle file preview close
    const handleCloseFilePreview = useCallback(() => {
        if (previewFile && previewFile.blobUrl) {
            URL.revokeObjectURL(previewFile.blobUrl);
        }
        setPreviewFile(null);
        setShowFilePreview(false);
        console.log(`👁️ [Widget ${widgetInstanceId}] File preview closed`);
    }, [previewFile, widgetInstanceId]);

    // Check if form has content
    const hasContent = useCallback(() => {
        const richTextPlainText = richTextRef.current?.innerText?.trim() || '';
        const fallbackComment = comment.trim();
        return richTextPlainText.length > 0 || fallbackComment.length > 0;
    }, [comment]);

    // Handle form submit - exits annotation mode after saving
    const handleSubmit = useCallback((event) => {
        event.preventDefault();
        
        if (isSubmitting || !canAddAnnotations) return;
        
        const richTextHtml = richTextRef.current?.innerHTML || '';
        const richTextPlainText = richTextRef.current?.innerText?.trim() || '';
        const fallbackComment = comment.trim();
        
        const finalComment = richTextPlainText || fallbackComment;
        
        if (!finalComment) {
            alert('Please enter a comment before adding the annotation.');
            return;
        }

        console.log(`💾 [Widget ${widgetInstanceId}] Submitting annotation with natural size coordinates:`, { 
            type: editingAnnotation ? 'edit' : 'new', 
            comment: finalComment.substring(0, 50) + '...',
            position: selectedPosition,
            area: selectedArea
        });
        
        setIsSubmitting(true);
        
        let updatedAnnotations;
        
        if (editingAnnotation) {
            updatedAnnotations = annotations.map(ann => 
                ann.id === editingAnnotation.id 
                    ? { 
                        ...ann, 
                        comment: finalComment,
                        richTextContent: richTextHtml,
                        referenceDoc: selectedReferenceDoc ? String(selectedReferenceDoc) : '',
                        uploadedFiles: uploadedFiles,
                        editedAt: new Date().toISOString()
                    }
                    : ann
            );
            console.log(`✏️ [Widget ${widgetInstanceId}] Annotation edited:`, editingAnnotation.id);
        } else {
            const newAnnotation = {
                id: `${widgetInstanceId}-${Date.now()}-${Math.random()}`,
                type: annotationType,
                position: selectedPosition,
                area: selectedArea,
                comment: finalComment,
                richTextContent: richTextHtml,
                referenceDoc: selectedReferenceDoc ? String(selectedReferenceDoc) : '',
                uploadedFiles: uploadedFiles,
                color: ANNOTATION_COLOR,
                user: currentUser,
                createdAt: new Date().toISOString(),
                widgetInstanceId: widgetInstanceId,
                fileInfo: {
                    bucket: s3BucketName?.value,
                    fileName: s3FileName?.value,
                    region: awsRegion?.value
                },
                // FIXED positioning metadata for natural-sized images
                createdInMaximizedView: isMaximized,
                positioningVersion: 'v12-natural-size-with-scroll-navigation',
                imageDimensions: imageDimensions,
                coordinateSystem: 'percentage-natural-size'
            };

            updatedAnnotations = [...annotations, newAnnotation];
            console.log(`➕ [Widget ${widgetInstanceId}] New annotation created with natural size coordinates:`, newAnnotation.id);
        }

        saveAnnotations(updatedAnnotations);
        
        // Reset form and exit annotation mode
        setComment('');
        setSelectedReferenceDoc('');
        setSelectedReferenceDocName('');
        setReferenceSearchTerm('');
        setUploadedFiles([]);
        setRichTextContent('');
        setShowForm(false);
        setSelectedPosition(null);
        setSelectedArea(null);
        setEditingAnnotation(null);
        setIsSubmitting(false);
        setIsAnnotationMode(false);
        if (richTextRef.current) {
            richTextRef.current.innerHTML = '';
        }
        
        console.log(`✅ [Widget ${widgetInstanceId}] Form reset and annotation mode exited`);
    }, [comment, selectedReferenceDoc, uploadedFiles, isSubmitting, selectedPosition, selectedArea, annotations, saveAnnotations, currentUser, s3BucketName, s3FileName, awsRegion, editingAnnotation, canAddAnnotations, annotationType, richTextContent, isMaximized, imageDimensions, widgetInstanceId]);

    // Handle form cancel - exits annotation mode
    const handleCancel = useCallback(() => {
        console.log(`❌ [Widget ${widgetInstanceId}] Form cancelled`);
        
        setComment('');
        setSelectedReferenceDoc('');
        setSelectedReferenceDocName('');
        setReferenceSearchTerm('');
        setUploadedFiles([]);
        setRichTextContent('');
        setShowForm(false);
        setSelectedPosition(null);
        setSelectedArea(null);
        setEditingAnnotation(null);
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentArea(null);
        setIsAnnotationMode(false);
        if (richTextRef.current) {
            richTextRef.current.innerHTML = '';
        }
    }, [widgetInstanceId]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!showAnnotationDropdown && !showReferenceDropdown) return;
            
            const widgetContainer = containerRef.current;
            if (!widgetContainer) return;
            
            const isClickInWidget = widgetContainer.contains(event.target);
            
            if (showAnnotationDropdown) {
                const annotationDropdown = event.target.closest(`[data-widget-id="${widgetInstanceId}"] .add-dropdown-container`);
                if (!annotationDropdown && isClickInWidget) {
                    setShowAnnotationDropdown(false);
                } else if (!isClickInWidget) {
                    setShowAnnotationDropdown(false);
                }
            }
            
            if (showReferenceDropdown) {
                const referenceDropdown = refDocDropdownRef.current;
                if (referenceDropdown && !referenceDropdown.contains(event.target)) {
                    setShowReferenceDropdown(false);
                }
            }
        };
        
        if (showAnnotationDropdown || showReferenceDropdown) {
            document.addEventListener('mousedown', handleClickOutside, true);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside, true);
            };
        }
    }, [showAnnotationDropdown, showReferenceDropdown, widgetInstanceId]);

    // Toggle annotation expansion
    const toggleAnnotationExpansion = useCallback((annotationId) => {
        setExpandedAnnotations(prev => {
            const newSet = new Set(prev);
            if (newSet.has(annotationId)) {
                newSet.delete(annotationId);
            } else {
                newSet.add(annotationId);
            }
            return newSet;
        });
    }, []);

    // Get truncated text for annotations
    const getTruncatedText = useCallback((annotation) => {
        const plainText = annotation.richTextContent ? 
            annotation.richTextContent.replace(/<[^>]*>/g, '') : 
            annotation.comment;
        
        const truncated = plainText.length > MAX_COMMENT_LENGTH ? 
            plainText.substring(0, MAX_COMMENT_LENGTH) + '...' : 
            plainText;
            
        return annotation.richTextContent ? 
            `<p>${truncated}</p>` : 
            truncated;
    }, []);

    // Handle marker click
    const handleMarkerClick = useCallback((annotation, event) => {
        event.stopPropagation();
        console.log(`🎯 [Widget ${widgetInstanceId}] Annotation clicked on image:`, annotation.id);
        setActiveAnnotationId(annotation.id);
    }, [widgetInstanceId]);

    // UPDATED: Handle annotation list click - now includes scroll-to functionality
    const handleListClick = useCallback((annotation) => {
        console.log(`📋 [Widget ${widgetInstanceId}] Annotation selected from list:`, annotation.id);
        setActiveAnnotationId(annotation.id);
        
        // NEW: Scroll to annotation position with a small delay to ensure state update
        setTimeout(() => {
            scrollToAnnotation(annotation);
        }, 100);
    }, [widgetInstanceId, scrollToAnnotation]);

    // Handle edit annotation
    const handleEditAnnotation = useCallback((annotation, event) => {
        if (!canAddAnnotations || !canEditAnnotation(annotation)) return;
        
        event.stopPropagation();
        console.log(`✏️ [Widget ${widgetInstanceId}] Editing annotation:`, annotation.id);
        
        setEditingAnnotation(annotation);
        setComment(annotation.comment);
        
        if (annotation.referenceDoc) {
            setSelectedReferenceDoc(String(annotation.referenceDoc));
            const refDoc = referenceDocList.find(doc => String(doc.id) === String(annotation.referenceDoc));
            if (refDoc) {
                setSelectedReferenceDocName(refDoc.name);
                setReferenceSearchTerm(refDoc.name);
            }
        }
        
        setUploadedFiles(annotation.uploadedFiles || []);
        setRichTextContent(annotation.richTextContent || '');
        
        setTimeout(() => {
            if (richTextRef.current) {
                richTextRef.current.innerHTML = annotation.richTextContent || annotation.comment;
            }
        }, 100);
        
        setShowForm(true);
    }, [canAddAnnotations, canEditAnnotation, referenceDocList, widgetInstanceId]);

    // ENHANCED: Handle delete with proper microflow execution
    const handleDelete = useCallback((annotationId, event) => {
        if (!canAddAnnotations) return;
        
        event.stopPropagation();
        
        const annotation = annotations.find(ann => ann.id === annotationId);
        if (!annotation || !canEditAnnotation(annotation)) {
            alert('You can only delete your own annotations.');
            return;
        }
        
        console.log(`🗑️ [Widget ${widgetInstanceId}] Deleting annotation:`, annotationId);
        
        if (window.confirm('Are you sure you want to delete this annotation?')) {
            addDebugLog("=== DELETING IMAGE ANNOTATION ===");
            addDebugLog(`Deleting annotation ID: ${annotationId}`);
            
            const updated = annotations.filter(ann => ann.id !== annotationId);
            
            // First update the UI
            setAnnotations(updated);
            
            // Save to Mendix attribute
            try {
                const jsonString = JSON.stringify(updated);
                
                if (imageAnnotations && typeof imageAnnotations.setValue === 'function') {
                    addDebugLog("📝 Updating annotations attribute after delete...");
                    imageAnnotations.setValue(jsonString);
                    addDebugLog("✅ Annotations attribute updated successfully");
                } else if (imageAnnotations && imageAnnotations.value !== undefined) {
                    imageAnnotations.value = jsonString;
                    addDebugLog("✅ Annotations value updated directly");
                }
            } catch (error) {
                addDebugLog(`❌ Error updating annotations after delete: ${error.message}`);
            }
            
            // ENHANCED: Execute onAnnotationDelete microflow
            if (onAnnotationDelete) {
                addDebugLog("📞 Executing onAnnotationDelete microflow...");
                const microflowSuccess = executeMendixAction(onAnnotationDelete, 'onAnnotationDelete');
                if (microflowSuccess) {
                    addDebugLog("✅ onAnnotationDelete microflow executed successfully");
                } else {
                    addDebugLog("❌ onAnnotationDelete microflow execution failed");
                }
            } else {
                addDebugLog("ℹ️ onAnnotationDelete not configured");
            }
            
            // Clean up UI state
            if (activeAnnotationId === annotationId) {
                setActiveAnnotationId(null);
            }
            
            setExpandedAnnotations(prev => {
                const newSet = new Set(prev);
                newSet.delete(annotationId);
                return newSet;
            });
            
            addDebugLog("✅ Annotation deleted successfully");
            addDebugLog("=== END DELETING IMAGE ANNOTATION ===");
            
            console.log(`✅ [Widget ${widgetInstanceId}] Annotation deleted successfully`);
        }
    }, [annotations, imageAnnotations, onAnnotationDelete, activeAnnotationId, canAddAnnotations, canEditAnnotation, addDebugLog, executeMendixAction, widgetInstanceId]);

    // Utility functions
    const getFormattedTime = useCallback((dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 86400) {
            if (diffInSeconds < 60) return 'Just now';
            if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
            return `${Math.floor(diffInSeconds / 3600)}h ago`;
        }
        
        return date.toLocaleDateString('en-US', { 
            month: 'numeric', 
            day: 'numeric', 
            year: 'numeric' 
        });
    }, []);

    const getSortedAnnotations = useCallback(() => {
        return [...annotations].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [annotations]);

    const getAnnotationNumber = useCallback((annotationId) => {
        const sorted = getSortedAnnotations();
        const index = sorted.findIndex(ann => ann.id === annotationId);
        return index + 1;
    }, [getSortedAnnotations]);

    // Filtered reference documents based on search term
    const filteredReferenceDocuments = useCallback(() => {
        if (!referenceSearchTerm.trim()) {
            return referenceDocList;
        }
        return referenceDocList.filter(doc => 
            doc.name.toLowerCase().includes(referenceSearchTerm.toLowerCase())
        );
    }, [referenceDocList, referenceSearchTerm]);

    const formatFileSize = useCallback((bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    // Enhanced loading spinner render function
    const renderLoadingSpinner = () => {
        return createElement('div', {
            className: 'image-loading-container',
            style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                minHeight: '400px',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #dee2e6',
                borderRadius: '12px',
                color: '#6c757d',
                padding: '60px 40px',
                textAlign: 'center'
            }
        }, [
            createElement('div', {
                key: 'spinner-container',
                className: 'loading-spinner-container',
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                }
            }, [
                createElement('div', {
                    key: 'spinner',
                    className: 'loading-spinner',
                    style: {
                        width: '60px',
                        height: '60px',
                        border: '4px solid #e3e3e3',
                        borderTop: '4px solid #4F46E5',
                        borderRadius: '50%',
                        animation: 'imageannotator-spin 1s linear infinite',
                        marginBottom: '24px'
                    }
                }),
                createElement('p', {
                    key: 'loading-text',
                    className: 'loading-text',
                    style: {
                        margin: '0',
                        fontSize: '18px',
                        fontWeight: '500',
                        color: '#4F46E5',
                        letterSpacing: '0.5px'
                    }
                }, 'Loading image - SCROLL & NAVIGATE TO ANNOTATIONS'),
                createElement('p', {
                    key: 'loading-subtext',
                    style: {
                        margin: '8px 0 0 0',
                        fontSize: '14px',
                        color: '#9CA3AF',
                        fontStyle: 'italic'
                    }
                }, 'Click annotations in sidebar to jump to position ✨')
            ])
        ]);
    };

    // Handle different loading/error states
    if (imageError) {
        return createElement('div', {
            className: `mx-imageannotator mx-imageannotator-error ${className} ${isMaximized ? 'img-maximized' : ''}`.trim(),
            style,
            'data-mendix-id': name,
            'data-custom-class': className,
            'data-widget-id': widgetInstanceId,
            'data-widget-instance': widgetInstanceId,
            ref: containerRef
        }, [
            createElement('div', {
                key: 'error-content',
                className: 'error-content'
            }, [
                createElement('div', {
                    key: 'icon',
                    className: 'error-icon'
                }, '⚠️'),
                createElement('p', {
                    key: 'message',
                    className: 'error-message'
                }, imageError),
                createElement('button', {
                    key: 'retry',
                    className: 'retry-button',
                    onClick: generateImageUrl
                }, 'Retry')
            ])
        ]);
    }

    // Show spinner while loading
    if (loadingImage || !imageUrl) {
        return createElement('div', {
            className: `mx-imageannotator ${className} ${isMaximized ? 'img-maximized' : ''}`.trim(),
            style,
            tabIndex,
            'data-mendix-id': name,
            'data-custom-class': className,
            'data-widget-id': widgetInstanceId,
            'data-widget-instance': widgetInstanceId,
            ref: containerRef
        }, renderLoadingSpinner());
    }

    // MAIN RENDER - NATURAL SIZE WITH SCROLL + NAVIGATION SYSTEM
    return createElement('div', {
        className: `mx-imageannotator ${className} ${isMaximized ? 'img-maximized' : ''}`.trim(),
        style,
        tabIndex,
        'data-mendix-id': name,
        'data-custom-class': className,
        'data-widget-id': widgetInstanceId,
        'data-widget-instance': widgetInstanceId,
        ref: containerRef
    }, [
        // Main content
        createElement('div', {
            key: 'main-content',
            className: 'main-content'
        }, [
            // Image area with header
            createElement('div', {
                key: 'image-area',
                className: 'image-area'
            }, [
                // Header WITHOUT zoom controls
                createElement('div', {
                    key: 'image-header-bar',
                    className: 'image-header-bar'
                }, [
                    createElement('div', {
                        key: 'header-left',
                        className: 'header-left'
                    }, [
                        createElement('button', {
                            key: 'maximize-btn',
                            onClick: handleMaximizeToggle,
                            className: `img-button img-maximize-minimize-btn ${isMaximized ? 'img-minimize-btn' : 'img-maximize-btn'}`,
                            title: isMaximized ? 'Minimize (Press Esc)' : 'Maximize'
                        }, isMaximized ? 'Minimize' : 'Maximize')
                    ]),
                    
                    createElement('div', {
                        key: 'header-right',
                        className: 'header-right'
                    }, [
                        // Annotation controls
                        canAddAnnotations ? createElement('div', {
                            key: 'add-dropdown-container',
                            className: 'add-dropdown-container'
                        }, [
                            createElement('button', {
                                key: 'add-annotation-btn',
                                className: `add-annotation-btn ${isAnnotationMode ? 'annotation-mode' : ''}`,
                                onClick: (e) => {
                                    e.stopPropagation();
                                    if (isAnnotationMode) {
                                        console.log(`❌ [Widget ${widgetInstanceId}] Annotation mode cancelled`);
                                        setIsAnnotationMode(false);
                                        setIsDrawing(false);
                                        setStartPoint(null);
                                        setCurrentArea(null);
                                    } else {
                                        console.log(`🎯 [Widget ${widgetInstanceId}] Annotation dropdown toggled`);
                                        setShowAnnotationDropdown(!showAnnotationDropdown);
                                    }
                                }
                            }, [
                                createElement('span', { key: 'text' }, 
                                    isAnnotationMode ? 'Cancel Annotation' : 'Add Annotation'),
                                !isAnnotationMode && createElement('span', { key: 'chevron' }, '▼')
                            ].filter(Boolean)),
                            
                            // Dropdown menu
                            showAnnotationDropdown && createElement('div', {
                                key: 'annotation-dropdown',
                                className: 'annotation-dropdown-menu',
                                onClick: (e) => e.stopPropagation()
                            }, [
                                createElement('button', {
                                    key: 'select-point',
                                    className: 'dropdown-menu-item',
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        handleSelectPoint();
                                    }
                                }, 'Select Point'),
                                
                                createElement('button', {
                                    key: 'select-area',
                                    className: 'dropdown-menu-item',
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        handleSelectArea();
                                    }
                                }, 'Select Area')
                            ])
                        ]) : null
                    ].filter(Boolean))
                ]),
                
                // FIXED: Restore scroll container for proper image navigation at natural size
                createElement('div', {
                    key: 'image-container',
                    ref: imageContainerRef,
                    className: 'image-container white-bg'
                }, [
                    // RESTORED: Scroll container that enables panning around full-size image + navigation to annotations
                    createElement('div', {
                        key: 'zoom-scroll-container',
                        ref: scrollContainerRef,
                        className: 'zoom-scroll-container',
                        style: {
                            width: '100%',
                            height: '100%',
                            position: 'relative',
                            overflow: 'auto', // Allow scrolling for large images
                            display: 'flex',
                            alignItems: 'flex-start', // Start from top
                            justifyContent: 'flex-start' // Start from left
                        }
                    }, [
                        // FIXED: Image container that maintains natural size
                        createElement('div', {
                            key: 'image-container-inner',
                            className: 'image-container-inner',
                            style: {
                                position: 'relative',
                                // Display image at natural size (like 100% zoom)
                                width: imageDimensions.width ? `${imageDimensions.width}px` : 'auto',
                                height: imageDimensions.height ? `${imageDimensions.height}px` : 'auto',
                                minWidth: imageDimensions.width ? `${imageDimensions.width}px` : '100%',
                                minHeight: imageDimensions.height ? `${imageDimensions.height}px` : '100%',
                                flexShrink: 0
                            }
                        }, [
                            // FIXED: Image displays at natural size with proper scrolling
                            createElement('img', {
                                key: 'main-image',
                                ref: imageRef,
                                src: imageUrl,
                                alt: 'Annotatable content',
                                className: `main-image ${isAnnotationMode ? 'annotation-mode' : ''}`,
                                onClick: handleImageClick,
                                onMouseDown: handleMouseDown,
                                onMouseMove: handleMouseMove,
                                onMouseUp: handleMouseUp,
                                onLoad: handleImageLoad,
                                draggable: false,
                                style: {
                                    // Display at natural size (like 100% zoom)
                                    width: imageDimensions.width ? `${imageDimensions.width}px` : 'auto',
                                    height: imageDimensions.height ? `${imageDimensions.height}px` : 'auto',
                                    display: 'block',
                                    cursor: isAnnotationMode ? 'crosshair' : 'default',
                                    userSelect: 'none',
                                    pointerEvents: 'auto',
                                    // Remove object-fit to allow natural sizing
                                    objectFit: 'none',
                                    margin: 0,
                                    padding: 0
                                }
                            }),
                            
                            // Current area being drawn
                            currentArea && createElement('div', {
                                key: 'current-area',
                                className: 'drawing-area',
                                style: {
                                    position: 'absolute',
                                    left: `${currentArea.x}%`,
                                    top: `${currentArea.y}%`,
                                    width: `${currentArea.width}%`,
                                    height: `${currentArea.height}%`,
                                    border: '2px dashed #3B82F6',
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    pointerEvents: 'none',
                                    zIndex: 10
                                }
                            }),
                            
                            // FIXED: Annotations with percentage positioning on natural-sized image
                            ...getSortedAnnotations().map((annotation) => {
                                const isActive = activeAnnotationId === annotation.id;
                                const annotationNumber = getAnnotationNumber(annotation.id);
                                const positionStyle = getAnnotationPositionStyle(annotation);
                                
                                if (annotation.type === 'area') {
                                    return createElement('div', {
                                        key: annotation.id,
                                        className: `annotation-area ${isActive ? 'active' : ''}`,
                                        style: {
                                            ...positionStyle,
                                            border: '2px solid #3B82F6',
                                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                            cursor: 'pointer',
                                            zIndex: 5
                                        },
                                        onClick: (e) => handleMarkerClick(annotation, e),
                                        title: annotation.comment
                                    }, [
                                        createElement('div', {
                                            key: 'area-label',
                                            className: 'area-annotation-label',
                                            style: {
                                                position: 'absolute',
                                                top: '-25px',
                                                left: '0',
                                                backgroundColor: '#3B82F6',
                                                color: 'white',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '12px',
                                                fontWeight: '600',
                                                whiteSpace: 'nowrap'
                                            }
                                        }, annotationNumber.toString())
                                    ]);
                                } else {
                                    return createElement('div', {
                                        key: annotation.id,
                                        className: `annotation-marker ${isActive ? 'active' : ''}`,
                                        style: {
                                            ...positionStyle,
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            backgroundColor: ANNOTATION_COLOR,
                                            border: '2px solid white',
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '10px',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            zIndex: 15,
                                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)'
                                        },
                                        onClick: (e) => handleMarkerClick(annotation, e),
                                        title: annotation.comment
                                    }, annotationNumber.toString());
                                }
                            })
                        ])
                    ])
                ])
            ]),
            
            // Enhanced annotations sidebar with navigation functionality
            createElement('div', {
                key: 'annotations-sidebar',
                className: 'annotations-sidebar'
            }, [
                createElement('div', {
                    key: 'sidebar-header',
                    className: 'sidebar-header'
                }, [
                    createElement('h3', {
                        key: 'sidebar-title',
                        className: 'sidebar-title'
                    }, 'Annotations'),
                    createElement('div', {
                        key: 'annotation-count',
                        className: 'annotation-count-badge'
                    }, annotations.length.toString())
                ]),
                
                createElement('div', {
                    key: 'annotations-list',
                    className: 'annotations-list'
                }, annotations.length > 0 ? 
                    getSortedAnnotations().map((annotation) => {
                        const isActive = activeAnnotationId === annotation.id;
                        const annotationNumber = getAnnotationNumber(annotation.id);
                        const isExpanded = expandedAnnotations.has(annotation.id);
                        
                        return createElement('div', {
                            key: annotation.id,
                            className: `annotation-item ${isActive ? 'selected' : ''}`,
                            onClick: () => handleListClick(annotation),
                            title: 'Click to navigate to annotation position',
                            style: {
                                cursor: 'pointer'
                            }
                        }, [
                            // Header
                            createElement('div', {
                                key: 'annotation-header',
                                className: 'annotation-item-header'
                            }, [
                                createElement('div', {
                                    key: 'title-section',
                                    className: 'title-section'
                                }, [
                                    createElement('span', {
                                        key: 'annotation-number',
                                        className: 'annotation-number'
                                    }, annotationNumber),
                                    createElement('span', {
                                        key: 'annotation-type',
                                        className: 'annotation-type'
                                    }, annotation.type === 'area' ? '🟧' : '📍'),
                                    // NEW: Navigation hint
                                    createElement('span', {
                                        key: 'navigation-hint',
                                        className: 'navigation-hint',
                                        style: {
                                            fontSize: '10px',
                                            color: '#6b7280',
                                            marginLeft: '4px'
                                        }
                                    }, '🧭')
                                ]),
                                
                                (canAddAnnotations && canEditAnnotation(annotation)) ? createElement('div', {
                                    key: 'action-buttons',
                                    className: 'action-buttons'
                                }, [
                                    createElement('button', {
                                        key: 'edit-btn',
                                        className: 'action-btn edit-btn',
                                        onClick: (e) => handleEditAnnotation(annotation, e),
                                        title: 'Edit annotation'
                                    }, '✏'),
                                    createElement('button', {
                                        key: 'delete-btn',
                                        className: 'action-btn delete-btn',
                                        onClick: (e) => handleDelete(annotation.id, e),
                                        title: 'Delete annotation'
                                    }, '🗑')
                                ]) : null
                            ]),
                            
                            // Content
                            createElement('div', {
                                key: 'annotation-content',
                                className: 'annotation-content'
                            }, [
                                // Comment text
                                annotation.richTextContent ? 
                                    createElement('div', {
                                        key: 'rich-text',
                                        className: 'annotation-rich-content',
                                        dangerouslySetInnerHTML: { 
                                            __html: isExpanded ? 
                                                annotation.richTextContent : 
                                                getTruncatedText(annotation)
                                        }
                                    }) : 
                                    createElement('p', {
                                        key: 'plain-text',
                                        className: 'annotation-text'
                                    }, isExpanded ? 
                                        annotation.comment : 
                                        getTruncatedText(annotation)),
                                
                                // Read more/less button
                                createElement('button', {
                                    key: 'read-more-btn',
                                    className: 'read-more-btn',
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        toggleAnnotationExpansion(annotation.id);
                                    }
                                }, isExpanded ? 'Read Less' : 'Read More'),
                                
                                // Files and reference documents - ONLY show when expanded
                                isExpanded && [
                                    // Files
                                    annotation.uploadedFiles && annotation.uploadedFiles.length > 0 && 
                                    createElement('div', {
                                        key: 'files',
                                        className: 'annotation-files'
                                    }, [
                                        createElement('div', {
                                            key: 'files-title',
                                            className: 'annotation-files-title'
                                        }, 'Files:'),
                                        ...annotation.uploadedFiles.map(file => 
                                            createElement('div', {
                                                key: file.id,
                                                className: 'annotation-file-item clickable-file',
                                                onClick: (e) => {
                                                    e.stopPropagation();
                                                    handlePreviewFile(file);
                                                },
                                                title: 'Click to preview file'
                                            }, `📄 ${file.name}`)
                                        )
                                    ]),
                                
                                    // Reference document
                                    annotation.referenceDoc && createElement('div', {
                                        key: 'reference-doc',
                                        className: 'annotation-reference-doc'
                                    }, [
                                        createElement('div', {
                                            key: 'ref-title',
                                            className: 'annotation-files-title'
                                        }, 'Reference Document:'),
                                        createElement('div', {
                                            key: 'ref-content',
                                            className: 'clickable-file reference-doc-item',
                                            onClick: (e) => {
                                                e.stopPropagation();
                                                const doc = referenceDocList.find(d => String(d.id) === String(annotation.referenceDoc));
                                                if (doc && doc.link) {
                                                    window.open(doc.link, '_blank');
                                                }
                                            },
                                            title: 'Click to view reference document'
                                        }, (() => {
                                            const refDoc = referenceDocList.find(doc => String(doc.id) === String(annotation.referenceDoc));
                                            return refDoc ? `📄 ${refDoc.name}` : `📄 Document ID: ${annotation.referenceDoc}`;
                                        })())
                                    ])
                                ]
                            ]),
                            
                            // Footer
                            createElement('div', {
                                key: 'annotation-footer',
                                className: 'annotation-footer'
                            }, [
                                createElement('span', {
                                    key: 'author',
                                    className: 'author',
                                    style: {
                                        color: canEditAnnotation(annotation) ? '#10B981' : '#6B7280',
                                        fontWeight: canEditAnnotation(annotation) ? '600' : '400'
                                    }
                                }, `${annotation.user}${canEditAnnotation(annotation) ? ' (You)' : ''}`),
                                createElement('span', {
                                    key: 'date',
                                    className: 'date'
                                }, getFormattedTime(annotation.createdAt))
                            ])
                        ]);
                    }) :
                    createElement('div', {
                        className: 'no-annotations'
                    }, 'No annotations yet - Click "Add Annotation" to start ✨')
                )
            ])
        ]),
        
        // FIXED: Form modal with proper z-index matching PDF widget approach
        showForm && createElement(AnnotationPortal, null, createElement('div', {
            key: 'form-overlay',
            className: 'img-annotation-form-overlay',
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: isMaximized ? 60000 : 10000, // FIXED: Use same z-index as PDF widget
                backdropFilter: 'blur(4px)',
                padding: '20px',
                boxSizing: 'border-box'
            },
            onClick: (e) => {
                if (e.target === e.currentTarget) {
                    handleCancel();
                }
            }
        }, [
            createElement('div', {
                key: 'form-modal',
                className: 'img-annotation-form-modal',
                style: {
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    width: '90%',
                    maxWidth: '600px',
                    maxHeight: '85vh',
                    overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    animation: 'modalSlideIn 0.3s ease-out',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative'
                }
            }, [
                // Header
                createElement('div', {
                    key: 'form-header',
                    className: 'img-annotation-form-header',
                    style: {
                        backgroundColor: '#f8fafc',
                        color: '#1e293b',
                        padding: '20px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #e2e8f0',
                        flexShrink: 0
                    }
                }, [
                    createElement('h2', {
                        key: 'form-title',
                        className: 'img-annotation-form-title',
                        style: {
                            margin: '0',
                            fontSize: '20px',
                            fontWeight: '600',
                            color: '#1e293b'
                        }
                    }, editingAnnotation ? 'Edit Annotation' : 'New Annotation'),
                    createElement('button', {
                        key: 'close-btn',
                        className: 'img-annotation-form-close',
                        onClick: handleCancel,
                        style: {
                            width: '32px',
                            height: '32px',
                            border: 'none',
                            backgroundColor: '#f1f5f9',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            color: '#64748b',
                            transition: 'all 0.2s ease'
                        }
                    }, '×')
                ]),
                
                // Body
                createElement('div', {
                    key: 'form-body',
                    className: 'img-annotation-form-body',
                    style: {
                        padding: '24px',
                        flex: 1,
                        overflowY: 'auto'
                    }
                }, [
                    // Rich text editor section
                    createElement('div', {
                        key: 'richtext-section',
                        className: 'form-section',
                        style: {
                            marginBottom: '24px'
                        }
                    }, [
                        createElement('div', {
                            key: 'richtext-toolbar',
                            className: 'richtext-toolbar',
                            style: {
                                display: 'flex',
                                gap: '4px',
                                marginBottom: '8px',
                                padding: '8px',
                                backgroundColor: '#f8f9fa',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                borderBottomLeftRadius: '0',
                                borderBottomRightRadius: '0'
                            }
                        }, [
                            createElement('button', {
                                key: 'bold-btn',
                                className: 'richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('bold'),
                                title: 'Bold',
                                style: {
                                    padding: '6px 10px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease',
                                    color: '#374151'
                                }
                            }, 'B'),
                            createElement('button', {
                                key: 'italic-btn',
                                className: 'richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('italic'),
                                title: 'Italic',
                                style: {
                                    padding: '6px 10px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease',
                                    color: '#374151'
                                }
                            }, 'I'),
                            createElement('button', {
                                key: 'underline-btn',
                                className: 'richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('underline'),
                                title: 'Underline',
                                style: {
                                    padding: '6px 10px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease',
                                    color: '#374151'
                                }
                            }, 'U'),
                            createElement('button', {
                                key: 'list-btn',
                                className: 'richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('insertUnorderedList'),
                                title: 'Bullet List',
                                style: {
                                    padding: '6px 10px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease',
                                    color: '#374151'
                                }
                            }, '•')
                        ]),
                        
                        createElement('div', {
                            key: 'richtext-editor',
                            ref: richTextRef,
                            className: 'richtext-editor',
                            contentEditable: true,
                            'data-placeholder': 'Enter your comment with formatting...',
                            onInput: handleRichTextInput,
                            style: {
                                minHeight: '120px',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                padding: '16px',
                                border: '1px solid #e5e7eb',
                                borderTop: 'none',
                                borderRadius: '0 0 6px 6px',
                                backgroundColor: 'white',
                                fontSize: '14px',
                                lineHeight: '1.6',
                                outline: 'none',
                                fontFamily: 'inherit',
                                transition: 'border-color 0.2s ease',
                                boxSizing: 'border-box',
                                width: '100%',
                                color: '#374151',
                                display: 'block',
                                position: 'relative'
                            }
                        })
                    ]),
                    
                    // File upload section
                    createElement('div', {
                        key: 'file-section',
                        className: 'form-section',
                        style: {
                            marginBottom: '24px'
                        }
                    }, [
                        createElement('label', {
                            key: 'file-label',
                            className: 'form-section-label',
                            style: {
                                display: 'block',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#374151',
                                marginBottom: '8px'
                            }
                        }, 'Attach Files:'),
                        
                        createElement('div', {
                            key: 'file-upload-area',
                            className: 'file-upload-area',
                            style: {
                                marginBottom: '16px'
                            }
                        }, [
                            createElement('input', {
                                key: `file-input-${widgetInstanceId}`,
                                ref: fileInputRef,
                                type: 'file',
                                id: `img-file-upload-input-${widgetInstanceId}`,
                                className: 'file-input',
                                'data-widget-id': widgetInstanceId,
                                multiple: true,
                                accept: '*/*',
                                onChange: handleFileUpload,
                                style: { display: 'none' },
                                onClick: (e) => e.stopPropagation()
                            }),
                            
                            createElement('button', {
                                key: 'file-upload-trigger',
                                type: 'button',
                                onClick: (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    triggerFileInput();
                                },
                                className: 'file-upload-btn-small',
                                disabled: isUploading,
                                style: { 
                                    cursor: isUploading ? 'not-allowed' : 'pointer',
                                    opacity: isUploading ? 0.6 : 1,
                                    padding: '8px 16px',
                                    fontSize: '14px',
                                    display: 'inline-block',
                                    backgroundColor: '#f3f4f6',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '6px'
                                }
                            }, isUploading ? 'Processing...' : '📎 Choose Files')
                        ]),
                        
                        // Uploaded files display
                        uploadedFiles.length > 0 && createElement('div', {
                            key: 'uploaded-files',
                            className: 'uploaded-files-list',
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                marginTop: '12px'
                            }
                        }, uploadedFiles.map(file => 
                            createElement('div', {
                                key: file.id,
                                className: 'uploaded-file-item',
                                style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    backgroundColor: '#f3f4f6',
                                    borderRadius: '6px',
                                    border: '1px solid #e5e7eb'
                                }
                            }, [
                                createElement('span', {
                                    key: 'file-icon',
                                    className: 'file-icon',
                                    style: {
                                        fontSize: '14px',
                                        marginRight: '8px'
                                    }
                                }, '📄'),
                                createElement('span', {
                                    key: 'file-name',
                                    className: 'file-name',
                                    style: {
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        color: '#1f2937',
                                        marginRight: '8px',
                                        flex: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }
                                }, file.name),
                                createElement('span', {
                                    key: 'file-size',
                                    className: 'file-size',
                                    style: {
                                        fontSize: '12px',
                                        color: '#6b7280',
                                        marginRight: '8px'
                                    }
                                }, formatFileSize(file.size)),
                                createElement('button', {
                                    key: 'remove-btn',
                                    className: 'file-remove-btn',
                                    onClick: () => removeFile(file.id),
                                    title: 'Remove file',
                                    style: {
                                        width: '24px',
                                        height: '24px',
                                        border: 'none',
                                        borderRadius: '4px',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }
                                }, '×')
                            ])
                        ))
                    ]),
                    
                    // Reference document section
                    referenceDocList.length > 0 && createElement('div', {
                        key: 'reference-section',
                        className: 'comment-form-group',
                        style: {
                            marginBottom: '24px'
                        }
                    }, [
                        createElement('label', {
                            key: 'reference-label',
                            className: 'comment-form-label',
                            style: {
                                display: 'block',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#374151',
                                marginBottom: '8px'
                            }
                        }, 'Tag Reference Document:'),
                        
                        createElement('div', {
                            key: 'reference-search-container',
                            ref: refDocDropdownRef,
                            className: 'reference-search-container',
                            style: {
                                position: 'relative',
                                width: '100%'
                            }
                        }, [
                            createElement('div', {
                                key: 'search-input-wrapper',
                                className: 'reference-search-input-wrapper',
                                style: {
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    width: '100%'
                                }
                            }, [
                                createElement('input', {
                                    key: 'reference-search-input',
                                    ref: searchInputRef,
                                    type: 'text',
                                    className: 'reference-search-input',
                                    placeholder: 'Search and select a reference document...',
                                    value: referenceSearchTerm,
                                    onChange: handleReferenceSearchChange,
                                    onFocus: handleReferenceSearchFocus,
                                    style: {
                                        width: '100%',
                                        padding: '12px 16px',
                                        paddingRight: '50px',
                                        border: '2px solid #e5e7eb',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        outline: 'none',
                                        fontFamily: 'inherit',
                                        transition: 'all 0.2s ease',
                                        boxSizing: 'border-box',
                                        backgroundColor: 'white',
                                        color: '#374151'
                                    }
                                }),
                                
                                // Dropdown arrow
                                createElement('div', {
                                    key: 'dropdown-arrow',
                                    className: 'reference-dropdown-arrow',
                                    onClick: () => setShowReferenceDropdown(!showReferenceDropdown),
                                    style: {
                                        position: 'absolute',
                                        right: '16px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: '#6b7280',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        zIndex: 2,
                                        padding: '4px',
                                        borderRadius: '4px',
                                        userSelect: 'none'
                                    }
                                }, showReferenceDropdown ? '▲' : '▼'),
                                
                                // Clear button
                                selectedReferenceDoc && createElement('button', {
                                    key: 'clear-button',
                                    type: 'button',
                                    className: 'reference-clear-button',
                                    onClick: clearReferenceSelection,
                                    title: 'Clear selection',
                                    style: {
                                        position: 'absolute',
                                        right: '35px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '18px',
                                        height: '18px',
                                        border: 'none',
                                        borderRadius: '50%',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s ease',
                                        zIndex: 3
                                    }
                                }, '×')
                            ]),
                            
                            // Dropdown menu
                            showReferenceDropdown && createElement('div', {
                                key: 'reference-dropdown-menu',
                                className: 'reference-dropdown-menu',
                                style: {
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    backgroundColor: 'white',
                                    border: '2px solid #e5e7eb',
                                    borderTop: 'none',
                                    borderRadius: '0 0 8px 8px',
                                    boxShadow: '0 8px 25px -5px rgba(0, 0, 0, 0.1)',
                                    zIndex: 1000,
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    marginTop: '-1px'
                                }
                            }, filteredReferenceDocuments().length > 0 ? 
                                filteredReferenceDocuments().map(doc =>
                                    createElement('div', {
                                        key: doc.id,
                                        className: 'reference-dropdown-item',
                                        onClick: () => handleReferenceDocSelect(doc),
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '12px 16px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            borderBottom: '1px solid #f3f4f6'
                                        }
                                    }, [
                                        createElement('div', {
                                            key: 'doc-icon',
                                            className: 'reference-doc-icon',
                                            style: {
                                                fontSize: '16px',
                                                flexShrink: 0
                                            }
                                        }, '📄'),
                                        createElement('div', {
                                            key: 'doc-name',
                                            className: 'reference-doc-name',
                                            style: {
                                                fontSize: '14px',
                                                color: '#374151',
                                                lineHeight: 1.4,
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }
                                        }, doc.name)
                                    ])
                                ) : 
                                createElement('div', {
                                    key: 'no-results',
                                    className: 'reference-no-results',
                                    style: {
                                        padding: '16px',
                                        textAlign: 'center',
                                        color: '#9ca3af',
                                        fontStyle: 'italic',
                                        fontSize: '14px',
                                        borderBottom: '1px solid #f3f4f6'
                                    }
                                }, 'No documents found')
                            )
                        ])
                    ]),
                    
                    // User display
                    createElement('div', {
                        key: 'user-display',
                        className: 'user-display',
                        style: {
                            fontSize: '12px',
                            color: '#6b7280',
                            fontStyle: 'italic',
                            marginTop: '16px',
                            padding: '8px 12px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb'
                        }
                    }, `Creating annotation as: ${currentUser}`)
                ]),
                
                // Footer
                createElement('div', {
                    key: 'form-footer',
                    className: 'img-annotation-form-footer',
                    style: {
                        padding: '16px 24px',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                        borderTop: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        flexShrink: 0
                    }
                }, [
                    createElement('button', {
                        key: 'cancel-btn',
                        className: 'btn btn-cancel',
                        onClick: handleCancel,
                        style: {
                            padding: '10px 20px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            border: 'none',
                            transition: 'all 0.2s ease',
                            fontFamily: 'inherit',
                            backgroundColor: '#6b7280',
                            color: 'white'
                        }
                    }, 'Cancel'),
                    createElement('button', {
                        key: 'save-btn',
                        className: 'btn btn-save',
                        onClick: handleSubmit,
                        disabled: !hasContent() || isSubmitting,
                        style: {
                            padding: '10px 20px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: !hasContent() || isSubmitting ? 'not-allowed' : 'pointer',
                            border: 'none',
                            transition: 'all 0.2s ease',
                            fontFamily: 'inherit',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            opacity: !hasContent() || isSubmitting ? 0.6 : 1
                        }
                    }, isSubmitting ? 'Saving...' : 'Save')
                ])
            ])
        ])),
        
        // FIXED: File preview modal with proper z-index matching PDF widget approach
        showFilePreview && previewFile && createElement(AnnotationPortal, null, createElement('div', {
            key: 'file-preview-overlay',
            className: 'img-file-preview-overlay',
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: isMaximized ? 60000 : 20000, // FIXED: Use same z-index as PDF widget
                backdropFilter: 'blur(4px)',
                boxSizing: 'border-box'
            },
            onClick: (e) => {
                if (e.target === e.currentTarget) {
                    handleCloseFilePreview();
                }
            }
        }, [
            createElement('div', {
                key: 'file-preview-modal',
                className: 'img-file-preview-modal',
                style: {
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    width: '90%',
                    maxWidth: '800px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    animation: 'modalSlideIn 0.3s ease-out',
                    position: 'relative'
                }
            }, [
                createElement('div', {
                    key: 'file-preview-header',
                    className: 'img-file-preview-header',
                    style: {
                        padding: '20px 24px',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0
                    }
                }, [
                    createElement('h3', {
                        key: 'file-preview-title',
                        className: 'img-file-preview-title',
                        style: {
                            margin: '0',
                            fontSize: '18px',
                            fontWeight: '600',
                            color: '#1f2937',
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginRight: '16px'
                        }
                    }, previewFile.name),
                    createElement('button', {
                        key: 'close-preview',
                        className: 'img-file-preview-close',
                        onClick: handleCloseFilePreview,
                        style: {
                            width: '32px',
                            height: '32px',
                            border: 'none',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            color: '#6b7280',
                            transition: 'all 0.2s ease'
                        }
                    }, '×')
                ]),
                
                createElement('div', {
                    key: 'file-preview-content',
                    className: 'img-file-preview-content',
                    style: {
                        flex: 1,
                        padding: '24px',
                        overflow: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }
                }, [
                    loadingPreview ? 
                        createElement('div', {
                            key: 'loading-preview',
                            className: 'img-file-preview-loading',
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '40px',
                                color: '#6b7280'
                            }
                        }, [
                            createElement('div', {
                                key: 'spinner',
                                className: 'loading-spinner',
                                style: {
                                    width: '40px',
                                    height: '40px',
                                    border: '3px solid #e3e3e3',
                                    borderTop: '3px solid #3b82f6',
                                    borderRadius: '50%',
                                    animation: 'imageannotator-spin 1s linear infinite',
                                    marginBottom: '16px'
                                }
                            }),
                            createElement('p', {
                                key: 'loading-text'
                            }, 'Loading file...')
                        ]) :
                        previewFile.blobUrl ? 
                            (previewFile.type.startsWith('image/') ? 
                                createElement('img', {
                                    key: 'image-preview',
                                    src: previewFile.blobUrl,
                                    alt: previewFile.name,
                                    className: 'img-file-preview-image',
                                    style: {
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        objectFit: 'contain',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                                    }
                                }) :
                                createElement('div', {
                                    key: 'download-preview',
                                    className: 'img-file-preview-download',
                                    style: {
                                        textAlign: 'center',
                                        padding: '40px'
                                    }
                                }, [
                                    createElement('div', {
                                        key: 'file-icon',
                                        className: 'img-file-preview-icon',
                                        style: {
                                            fontSize: '64px',
                                            marginBottom: '16px'
                                        }
                                    }, '📄'),
                                    createElement('p', {
                                        key: 'file-info',
                                        style: {
                                            margin: '0 0 20px 0',
                                            fontSize: '16px',
                                            color: '#6b7280'
                                        }
                                    }, `${previewFile.name} (${formatFileSize(previewFile.size)})`),
                                    createElement('a', {
                                        key: 'download-link',
                                        href: previewFile.blobUrl,
                                        download: previewFile.name,
                                        className: 'img-file-preview-download-btn',
                                        style: {
                                            display: 'inline-block',
                                            padding: '12px 24px',
                                            backgroundColor: '#3b82f6',
                                            color: 'white',
                                            textDecoration: 'none',
                                            borderRadius: '8px',
                                            fontWeight: '500',
                                            transition: 'all 0.2s ease'
                                        }
                                    }, 'Download File')
                                ])
                            ) : null
                ])
            ])
        ]))
    ]);
}

export default Imageannotator;