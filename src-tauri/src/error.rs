use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum MindFlowError {
    #[error("Context not found: {0}")]
    ContextNotFound(String),
    #[error("Node not found: {0}")]
    NodeNotFound(String),
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

impl Serialize for MindFlowError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
