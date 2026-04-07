// ========================================
// Jotlad GROUP OF SCHOOLS - MAIN JAVASCRIPT
// ========================================

document.addEventListener('DOMContentLoaded', function() {
  
  // ===== MOBILE NAVIGATION =====
  const menuToggle = document.getElementById('menuToggle');
  const navMenu = document.getElementById('navMenu');
  const navOverlay = document.getElementById('navOverlay');
  const navClose = document.getElementById('navClose');
  
  function closeMenu() {
    menuToggle.classList.remove('active');
    navMenu.classList.remove('active');
    navOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }
  
  function openMenu() {
    menuToggle.classList.add('active');
    navMenu.classList.add('active');
    navOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  
  if (menuToggle && navMenu) {
    // Open menu with hamburger
    menuToggle.addEventListener('click', function() {
      if (navMenu.classList.contains('active')) {
        closeMenu();
      } else {
        openMenu();
      }
    });
    
    // Close menu with X button
    if (navClose) {
      navClose.addEventListener('click', closeMenu);
    }
    
    // Close menu when clicking overlay
    if (navOverlay) {
      navOverlay.addEventListener('click', closeMenu);
    }
    
    // Close menu when clicking nav links
    navMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', closeMenu);
    });
  }
  
  // ===== NAVBAR SCROLL EFFECT =====
  const navbar = document.querySelector('.navbar');
  
  window.addEventListener('scroll', function() {
    if (window.scrollY > 100) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
  
  // ===== HERO SLIDER =====
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.slider-dot');
  const prevBtn = document.getElementById('prevSlide');
  const nextBtn = document.getElementById('nextSlide');
  let currentSlide = 0;
  let slideInterval;
  
  function showSlide(index) {
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === index);
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
    currentSlide = index;
  }
  
  function nextSlide() {
    showSlide((currentSlide + 1) % slides.length);
  }
  
  function prevSlide() {
    showSlide((currentSlide - 1 + slides.length) % slides.length);
  }
  
  function startSlider() {
    slideInterval = setInterval(nextSlide, 5000);
  }
  
  function resetSlider() {
    clearInterval(slideInterval);
    startSlider();
  }
  
  if (slides.length > 0) {
    startSlider();
    
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        showSlide(index);
        resetSlider();
      });
    });
    
    if (prevBtn && nextBtn) {
      prevBtn.addEventListener('click', () => {
        prevSlide();
        resetSlider();
      });
      
      nextBtn.addEventListener('click', () => {
        nextSlide();
        resetSlider();
      });
    }
  }
  
  // ===== PROGRAM TABS =====
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });
  
  // ===== TESTIMONIALS SLIDER =====
  const testimonialTrack = document.getElementById('testimonialTrack');
  const testimonialCards = document.querySelectorAll('.testimonial-card');
  let currentTestimonial = 0;
  
  function showTestimonial(index) {
    if (testimonialTrack) {
      testimonialTrack.style.transform = `translateX(-${index * 100}%)`;
    }
    currentTestimonial = index;
  }
  
  if (testimonialCards.length > 1) {
    setInterval(() => {
      showTestimonial((currentTestimonial + 1) % testimonialCards.length);
    }, 6000);
  }
  
  // ===== SCROLL ANIMATIONS =====
  const fadeElements = document.querySelectorAll('.fade-in');
  
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  fadeElements.forEach(el => observer.observe(el));
  
  // ===== GALLERY FILTER =====
  const filterBtns = document.querySelectorAll('.filter-btn');
  const galleryCards = document.querySelectorAll('.gallery-card');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      galleryCards.forEach(card => {
        if (filter === 'all' || card.dataset.category === filter) {
          card.style.display = 'block';
          setTimeout(() => card.style.opacity = '1', 10);
        } else {
          card.style.opacity = '0';
          setTimeout(() => card.style.display = 'none', 300);
        }
      });
    });
  });
  
  // ===== FORM VALIDATION =====
  const contactForm = document.getElementById('contactForm');
  
  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const name = this.querySelector('input[name="name"]').value.trim();
      const email = this.querySelector('input[name="email"]').value.trim();
      const phone = this.querySelector('input[name="phone"]').value.trim();
      const message = this.querySelector('textarea[name="message"]').value.trim();
      
      if (!name || !email || !phone || !message) {
        alert('Please fill in all required fields.');
        return;
      }
      
      if (!isValidEmail(email)) {
        alert('Please enter a valid email address.');
        return;
      }
      
      alert('Thank you for your message! We will get back to you soon.');
      this.reset();
    });
  }
  
  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  // ===== SMOOTH SCROLL =====
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }
    });
  });
  
});