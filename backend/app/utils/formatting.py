"""
Formatting utilities for the S3 Manager backend.
"""


def format_size(size_bytes: int) -> str:
    """Format byte size to human readable string.
    
    Args:
        size_bytes: Size in bytes
        
    Returns:
        Human-readable string like '1.50 GB' or '500 B'
    """
    if size_bytes == 0:
        return '0 B'
    
    units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    unit_index = 0
    size = float(size_bytes)
    
    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1
    
    return f'{size:.2f} {units[unit_index]}'
