use phpantom_lsp::LspDispatcher;

/// Stateful adapter for one PHPantom JSON-RPC session.
pub struct Runtime {
    dispatcher: LspDispatcher,
}

impl Runtime {
    pub fn new() -> Self {
        Self {
            dispatcher: LspDispatcher::new(),
        }
    }

    /// Dispatch one JSON-RPC request or notification through PHPantom's LSP path.
    pub fn handle(&self, message: &str) -> Option<String> {
        self.dispatcher.handle(message)
    }
}

impl Default for Runtime {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(target_arch = "wasm32", target_os = "wasi"))]
pub use phpantom_lsp::{lsp_alloc, lsp_dealloc, lsp_handle, lsp_response_len};
