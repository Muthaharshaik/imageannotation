import { createElement } from "react";

export function preview(props) {
    const imageUrl = props.imageUrl || "https://via.placeholder.com/600x400/e5e7eb/6b7280?text=Image+Preview";
    const annotationsData = props.imageAnnotations || "[]";
    
    let annotationCount = 0;
    try {
        const annotations = JSON.parse(annotationsData);
        if (Array.isArray(annotations)) {
            annotationCount = annotations.length;
        }
    } catch {
        // Ignore parsing errors in preview
    }

    return (
        <div className="image-annotator-container" style={{ minHeight: "200px" }}>
            {/* Preview Toolbar */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                background: "#f9fafb",
                borderBottom: "1px solid #e5e7eb",
                fontSize: "14px"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ color: "#111827" }}>Image Annotator</strong>
                    <span style={{
                        background: "#e5e7eb",
                        color: "#6b7280",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontSize: "12px"
                    }}>
                        {annotationCount} annotation{annotationCount !== 1 ? 's' : ''}
                    </span>
                </div>
                {!props.readOnly && (
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 12px",
                        background: "white",
                        border: "1px solid #d1d5db",
                        borderRadius: "4px",
                        color: "#374151",
                        fontSize: "12px"
                    }}>
                        🎯 Add Annotation
                    </div>
                )}
            </div>

            {/* Preview Image Area */}
            <div style={{ 
                padding: "16px", 
                background: "#f9fafb",
                minHeight: "160px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
            }}>
                <div style={{ 
                    position: "relative",
                    width: "100%",
                    maxWidth: "400px",
                    background: "white",
                    borderRadius: "6px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    overflow: "hidden"
                }}>
                    {imageUrl && imageUrl !== "https://via.placeholder.com/600x400/e5e7eb/6b7280?text=Image+Preview" ? (
                        <img 
                            src={imageUrl} 
                            alt="Preview" 
                            style={{ 
                                width: "100%", 
                                height: "auto",
                                display: "block",
                                maxHeight: `${props.maxImageHeight || 300}px`,
                                objectFit: "contain"
                            }}
                            onError={(e) => {
                                e.target.src = "https://via.placeholder.com/400x200/f3f4f6/9ca3af?text=Image+Not+Found";
                            }}
                        />
                    ) : (
                        <div style={{
                            width: "100%",
                            height: "200px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#9ca3af",
                            background: "#f3f4f6"
                        }}>
                            <div style={{ fontSize: "32px", marginBottom: "8px" }}>🖼️</div>
                            <div style={{ fontSize: "14px" }}>Configure Image S3 URL</div>
                        </div>
                    )}

                    {/* Sample annotation markers for preview */}
                    {annotationCount > 0 && (
                        <>
                            <div style={{
                                position: "absolute",
                                top: "30%",
                                left: "25%",
                                width: "16px",
                                height: "16px",
                                background: props.annotationColor === 'red' ? '#ef4444' : 
                                           props.annotationColor === 'green' ? '#10b981' :
                                           props.annotationColor === 'yellow' ? '#f59e0b' :
                                           props.annotationColor === 'purple' ? '#8b5cf6' :
                                           props.annotationColor === 'orange' ? '#f97316' : '#3b82f6',
                                borderRadius: "50%",
                                transform: "translate(-50%, -50%)",
                                border: "2px solid white",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                            }}>
                                <div style={{
                                    position: "absolute",
                                    top: "50%",
                                    left: "50%",
                                    width: "6px",
                                    height: "6px",
                                    background: "white",
                                    borderRadius: "50%",
                                    transform: "translate(-50%, -50%)"
                                }}></div>
                            </div>
                            
                            {annotationCount > 1 && (
                                <div style={{
                                    position: "absolute",
                                    top: "60%",
                                    left: "70%",
                                    width: "16px",
                                    height: "16px",
                                    background: props.annotationColor === 'red' ? '#ef4444' : 
                                               props.annotationColor === 'green' ? '#10b981' :
                                               props.annotationColor === 'yellow' ? '#f59e0b' :
                                               props.annotationColor === 'purple' ? '#8b5cf6' :
                                               props.annotationColor === 'orange' ? '#f97316' : '#3b82f6',
                                    borderRadius: "50%",
                                    transform: "translate(-50%, -50%)",
                                    border: "2px solid white",
                                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                                }}>
                                    <div style={{
                                        position: "absolute",
                                        top: "50%",
                                        left: "50%",
                                        width: "6px",
                                        height: "6px",
                                        background: "white",
                                        borderRadius: "50%",
                                        transform: "translate(-50%, -50%)"
                                    }}></div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Preview annotation list */}
            {props.showAnnotationList && annotationCount > 0 && (
                <div style={{
                    borderTop: "1px solid #e5e7eb",
                    background: "white"
                }}>
                    <div style={{
                        padding: "12px 16px",
                        background: "#f9fafb",
                        borderBottom: "1px solid #e5e7eb"
                    }}>
                        <div style={{ 
                            fontSize: "14px", 
                            fontWeight: "600", 
                            color: "#111827",
                            marginBottom: "2px"
                        }}>
                            Annotations ({annotationCount})
                        </div>
                        <div style={{ fontSize: "12px", color: "#6b7280" }}>
                            Click on any annotation to highlight it on the image
                        </div>
                    </div>
                    <div style={{ padding: "12px 16px" }}>
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "13px",
                            color: "#6b7280"
                        }}>
                            <div style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                background: props.annotationColor === 'red' ? '#ef4444' : 
                                           props.annotationColor === 'green' ? '#10b981' :
                                           props.annotationColor === 'yellow' ? '#f59e0b' :
                                           props.annotationColor === 'purple' ? '#8b5cf6' :
                                           props.annotationColor === 'orange' ? '#f97316' : '#3b82f6'
                            }}></div>
                            Sample annotation preview
                        </div>
                    </div>
                </div>
            )}

            {/* Configuration hints */}
            <div style={{
                padding: "12px 16px",
                background: "#f0f9ff",
                borderTop: "1px solid #e0f2fe",
                fontSize: "12px",
                color: "#0369a1"
            }}>
                ⚙️ Configure the Image S3 URL and Annotations attributes to get started
            </div>
        </div>
    );
}