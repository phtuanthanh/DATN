// ===== Counter Animation =====
function animateCounters() {
    const counters = document.querySelectorAll('.stat-number');
    const speed = 200; // milliseconds per increment

    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-count'));
        let count = 0;

        const increment = Math.ceil(target / (speed / 10));

        const updateCount = () => {
            count += increment;
            if (count >= target) {
                counter.textContent = target;
            } else {
                counter.textContent = count;
                setTimeout(updateCount, 10);
            }
        };

        // Only animate when element is in viewport
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    updateCount();
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        observer.observe(counter);
    });
}

// ===== Smooth Scroll =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ===== Parallax Effect =====
window.addEventListener('scroll', () => {
    const blobs = document.querySelectorAll('.blob');
    const scrolled = window.pageYOffset;

    blobs.forEach((blob, index) => {
        blob.style.transform = `translateY(${scrolled * (0.5 + index * 0.1)}px)`;
    });
});

// ===== Navbar Active Link =====
window.addEventListener('scroll', () => {
    let current = '';
    const sections = document.querySelectorAll('section');

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (pageYOffset >= (sectionTop - 200)) {
            current = section.getAttribute('id');
        }
    });

    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').slice(1) === current) {
            link.classList.add('active');
        }
    });
});

// ===== Intersection Observer for Fade-In Animations =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all animated elements
document.querySelectorAll('.fact-card, .news-card, .stat-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'all 0.6s ease-out';
    observer.observe(el);
});

// ===== Initialize Counters =====
document.addEventListener('DOMContentLoaded', () => {
    animateCounters();
});

// ===== Mouse Follow Effect (Optional) =====
document.addEventListener('mousemove', (e) => {
    const mouseX = e.clientX / window.innerWidth;
    const mouseY = e.clientY / window.innerHeight;

    const blobs = document.querySelectorAll('.blob');
    blobs.forEach((blob, index) => {
        const intensity = (index + 1) * 20;
        blob.style.transform = `translate(${mouseX * intensity}px, ${mouseY * intensity}px)`;
    });
});

// ===== Responsive Navigation Toggle =====
function setupMobileNav() {
    const navbar = document.querySelector('.navbar');
    const navLinks = document.querySelector('.nav-links');

    if (window.innerWidth <= 768) {
        if (!navbar.querySelector('.mobile-toggle')) {
            const toggle = document.createElement('button');
            toggle.className = 'mobile-toggle';
            toggle.innerHTML = '☰';
            toggle.addEventListener('click', () => {
                navLinks.classList.toggle('active');
            });
            navbar.querySelector('.container').appendChild(toggle);
        }
    }
}

window.addEventListener('resize', setupMobileNav);
setupMobileNav();

// ===== Form Validation (for future use) =====
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// ===== Performance: Lazy Load Images =====
document.addEventListener('DOMContentLoaded', () => {
    if ('IntersectionObserver' in window) {
        const images = document.querySelectorAll('img[data-lazy]');
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.getAttribute('data-lazy');
                    img.removeAttribute('data-lazy');
                    observer.unobserve(img);
                }
            });
        });

        images.forEach(img => imageObserver.observe(img));
    }
});

// ===== Scroll Progress Bar (Optional) =====
window.addEventListener('scroll', () => {
    const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (window.scrollY / windowHeight) * 100;

    let progressBar = document.getElementById('progress-bar');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'progress-bar';
        progressBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            height: 3px;
            background: linear-gradient(90deg, #00d4ff, #ff006e);
            z-index: 999;
            transition: width 0.1s ease;
        `;
        document.body.appendChild(progressBar);
    }
    progressBar.style.width = scrolled + '%';
});
